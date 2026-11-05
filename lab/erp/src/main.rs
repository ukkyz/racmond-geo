use axum::{extract::{Path, State}, http::{HeaderMap, StatusCode}, middleware::{self, Next}, response::{IntoResponse, Response}, routing::{get, post}, Json, Router};
use opentelemetry::{global, propagation::Extractor, trace::TracerProvider};
use tracing::Instrument;
use tracing_opentelemetry::OpenTelemetrySpanExt;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::{trace::SdkTracerProvider, Resource};
use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone)] struct AppState { db: PgPool, token: String }
struct Headers<'a>(&'a HeaderMap);
impl Extractor for Headers<'_> { fn get(&self, key: &str) -> Option<&str> { self.0.get(key).and_then(|v| v.to_str().ok()) } fn keys(&self) -> Vec<&str> { self.0.keys().map(|k| k.as_str()).collect() } }

async fn auth(State(state): State<AppState>, request: axum::extract::Request, next: Next) -> Response {
    if request.uri().path() == "/health" { return next.run(request).await; }
    if state.token.is_empty() || request.headers().get("x-racmond-lab-token").and_then(|v| v.to_str().ok()) != Some(&state.token) { return (StatusCode::FORBIDDEN, "Internal lab authentication required").into_response(); }
    next.run(request).await
}
async fn instrument(request: axum::extract::Request, next: Next) -> Response {
    let parent = global::get_text_map_propagator(|p| p.extract(&Headers(request.headers())));
    let span = tracing::info_span!("http.request", otel.kind = "server", http.request.method = %request.method(), url.path = %request.uri().path());
    span.set_parent(parent);
    let response = next.run(request).instrument(span).await;
    response
}
fn failure(message: impl std::fmt::Display) -> (StatusCode, String) { (StatusCode::INTERNAL_SERVER_ERROR, message.to_string()) }
async fn health(State(state): State<AppState>) -> impl IntoResponse { match sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&state.db).await { Ok(_) => StatusCode::OK, Err(_) => StatusCode::SERVICE_UNAVAILABLE } }
#[derive(Deserialize, Debug)] struct Reservation { id: Uuid, quantity: i32, #[serde(rename="amountCents")] amount_cents: i64, scenario: String }
#[tracing::instrument(name = "postgresql reserve", skip(state), fields(db.system = "postgresql", order.id = %input.id))]
async fn reserve(State(state): State<AppState>, Json(input): Json<Reservation>) -> Result<impl IntoResponse, (StatusCode,String)> {
    if !(1..=10).contains(&input.quantity) || input.amount_cents != input.quantity as i64 * 240000 || !["happy","slow-db","stock-conflict","duplicate-replay","gc-pressure"].contains(&input.scenario.as_str()) { return Err((StatusCode::UNPROCESSABLE_ENTITY,"Invalid reservation".into())); }
    let mut tx = state.db.begin().await.map_err(failure)?;
    let existing = sqlx::query_scalar::<_,String>("SELECT state FROM reservations WHERE order_id=$1 FOR UPDATE").bind(input.id).fetch_optional(&mut *tx).await.map_err(failure)?;
    if let Some(status) = existing { tx.commit().await.map_err(failure)?; return Ok(Json(serde_json::json!({"id":input.id,"state":status,"replayed":true}))); }
    if input.scenario == "stock-conflict" { return Err((StatusCode::CONFLICT,"Inventory conflict: reservation rejected".into())); }
    let changed = sqlx::query("UPDATE inventory SET available=available-$1 WHERE sku='RACK-42U' AND available>=$1").bind(input.quantity).execute(&mut *tx).await.map_err(failure)?;
    if changed.rows_affected()!=1 { return Err((StatusCode::CONFLICT,"Insufficient inventory".into())); }
    sqlx::query("INSERT INTO reservations(order_id,sku,quantity,state) VALUES($1,'RACK-42U',$2,'reserved')").bind(input.id).bind(input.quantity).execute(&mut *tx).await.map_err(failure)?;
    tx.commit().await.map_err(failure)?;
    Ok(Json(serde_json::json!({"id":input.id,"state":"reserved","replayed":false})))
}
#[tracing::instrument(name = "postgresql release", skip(state), fields(db.system = "postgresql"))]
async fn release(State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<impl IntoResponse,(StatusCode,String)> {
    let mut tx=state.db.begin().await.map_err(failure)?;
    let quantity=sqlx::query_scalar::<_,i32>("UPDATE reservations SET state='released' WHERE order_id=$1 AND state='reserved' RETURNING quantity").bind(id).fetch_optional(&mut *tx).await.map_err(failure)?;
    if let Some(q)=quantity { sqlx::query("UPDATE inventory SET available=available+$1 WHERE sku='RACK-42U'").bind(q).execute(&mut *tx).await.map_err(failure)?; }
    tx.commit().await.map_err(failure)?; Ok(StatusCode::OK)
}
#[tokio::main]
async fn main() -> Result<(),Box<dyn std::error::Error>> {
    let endpoint=std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT").unwrap_or_else(|_| "http://otel-collector:4318".into());
    let exporter=opentelemetry_otlp::SpanExporter::builder().with_http().with_endpoint(format!("{endpoint}/v1/traces")).build()?;
    let provider=SdkTracerProvider::builder().with_batch_exporter(exporter).with_resource(Resource::builder().with_service_name("erp").build()).build();
    global::set_tracer_provider(provider.clone());
    use tracing_subscriber::layer::SubscriberExt;
    use tracing_subscriber::util::SubscriberInitExt;
    let filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::registry().with(filter).with(tracing_subscriber::fmt::layer()).with(tracing_opentelemetry::layer().with_tracer(provider.tracer("racmond.erp"))).init();
    global::set_text_map_propagator(opentelemetry_sdk::propagation::TraceContextPropagator::new());
    let db=PgPoolOptions::new().max_connections(5).connect(&std::env::var("DATABASE_URL")?).await?;
    let state=AppState { db, token:std::env::var("LAB_INTERNAL_TOKEN").unwrap_or_default() };
    let app=Router::new().route("/health",get(health)).route("/reservations",post(reserve)).route("/reservations/{id}",axum::routing::delete(release)).layer(middleware::from_fn_with_state(state.clone(),auth)).layer(middleware::from_fn(instrument)).with_state(state);
    let listener=tokio::net::TcpListener::bind("0.0.0.0:8002").await?;
    let result=axum::serve(listener,app).await;
    provider.shutdown()?;
    result?;
    Ok(())
}
