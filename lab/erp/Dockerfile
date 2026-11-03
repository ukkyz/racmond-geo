FROM rust:1.88-bookworm AS build
WORKDIR /app
COPY Cargo.toml ./
COPY src src
RUN cargo build --release
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libssl3 && rm -rf /var/lib/apt/lists/* && useradd -r -u 10001 app
COPY --from=build /app/target/release/racmond-erp /usr/local/bin/racmond-erp
USER app
EXPOSE 8002
CMD ["racmond-erp"]
