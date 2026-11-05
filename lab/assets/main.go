package main

import (
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "log"
 "net/http"
 "os"
 "os/signal"
 "runtime"
 "runtime/metrics"
 "strings"
 "sync"
 "syscall"
 "time"
 "github.com/redis/go-redis/v9"
 "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
 otelruntime "go.opentelemetry.io/contrib/instrumentation/runtime"
 "go.opentelemetry.io/otel"
 "go.opentelemetry.io/otel/attribute"
 "go.opentelemetry.io/otel/codes"
 "go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
 "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
 "go.opentelemetry.io/otel/propagation"
 sdkmetric "go.opentelemetry.io/otel/sdk/metric"
 "go.opentelemetry.io/otel/sdk/resource"
 sdktrace "go.opentelemetry.io/otel/sdk/trace"
 "go.opentelemetry.io/otel/trace"
)

var db *redis.Client
var start = time.Now()
var gcMutex sync.Mutex
var lastGC uint32
var lastCPUTime float64
var lastCPUAt = time.Now()
type allocation struct { ID string `json:"id"`; Quantity int `json:"quantity"`; AmountCents int64 `json:"amountCents"`; Scenario string `json:"scenario"` }
type pool struct { Name string `json:"name"`; Used uint64 `json:"used"`; Committed uint64 `json:"committed"`; Max int64 `json:"max"` }
type gcEvent struct { At string `json:"at"`; Collector string `json:"collector"`; Cause string `json:"cause"`; DurationMS float64 `json:"durationMs"`; BeforeBytes uint64 `json:"beforeBytes"`; AfterBytes uint64 `json:"afterBytes"` }
func env(key, fallback string) string { if v:=os.Getenv(key);v!="" {return v};return fallback }
func jsonOut(w http.ResponseWriter,status int,v any){w.Header().Set("Content-Type","application/json");w.WriteHeader(status);json.NewEncoder(w).Encode(v)}
func secure(next http.HandlerFunc) http.HandlerFunc { return func(w http.ResponseWriter,r *http.Request){ token:=os.Getenv("LAB_INTERNAL_TOKEN");if token==""||r.Header.Get("X-Racmond-Lab-Token")!=token {jsonOut(w,403,map[string]string{"error":"Internal authentication required"});return};next(w,r)} }
// Assignment and publication commit atomically in one Redis Lua transaction.
// Replays publish a new trace envelope but do not create another asset assignment.
var allocateScript=redis.NewScript(`
local existing=redis.call('HGET',KEYS[1],'assetId')
local replayed=1
if not existing then
 existing=ARGV[1]
 redis.call('HSET',KEYS[1],'assetId',existing,'quantity',ARGV[2],'amountCents',ARGV[3])
 replayed=0
end
redis.call('XADD',KEYS[2],'MAXLEN','~',10000,'*','schema','1','orderId',ARGV[4],'amountCents',ARGV[3],'assetId',existing,'traceparent',ARGV[5],'scenario',ARGV[6])
return {existing,replayed}
`)
func allocate(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodPost {jsonOut(w,405,map[string]string{"error":"POST required"});return}
 var input allocation
 decoder:=json.NewDecoder(http.MaxBytesReader(w,r.Body,8192));decoder.DisallowUnknownFields()
 if err:=decoder.Decode(&input);err!=nil {jsonOut(w,422,map[string]string{"error":"Invalid JSON"});return}
 valid:=map[string]bool{"happy":true,"slow-db":true,"stock-conflict":true,"duplicate-replay":true,"gc-pressure":true}
 if len(input.ID)!=36||strings.Count(input.ID,"-")!=4||input.Quantity<1||input.Quantity>10||input.AmountCents!=int64(input.Quantity)*240000||!valid[input.Scenario] {jsonOut(w,422,map[string]string{"error":"Invalid allocation"});return}
 ctx,span:=otel.Tracer("racmond.assets").Start(r.Context(),"allocate.and.publish",trace.WithSpanKind(trace.SpanKindProducer),trace.WithAttributes(attribute.String("order.id",input.ID),attribute.String("messaging.system","redis_streams"),attribute.String("messaging.destination.name","orders.accepted")))
 defer span.End()
 carrier:=propagation.MapCarrier{};otel.GetTextMapPropagator().Inject(ctx,carrier)
 assetId:="RACK-"+strings.ToUpper(input.ID[:8])
 result,err:=allocateScript.Run(ctx,db,[]string{"allocation:"+input.ID,"orders.accepted"},assetId,input.Quantity,input.AmountCents,input.ID,carrier.Get("traceparent"),input.Scenario).Slice()
 if err!=nil {span.RecordError(err);span.SetStatus(codes.Error,"Redis allocation failed");jsonOut(w,503,map[string]string{"error":"Allocation unavailable"});return}
 if input.Scenario=="gc-pressure" {pressure(ctx)}
 span.SetAttributes(attribute.Bool("idempotent.replay",result[1]==int64(1)))
 jsonOut(w,201,map[string]any{"id":input.ID,"assetId":result[0],"replayed":result[1]==int64(1)})
}
func pressure(ctx context.Context){_,span:=otel.Tracer("racmond.assets").Start(ctx,"bounded allocation workload");defer span.End();sink:=make([][]byte,0,8);for i:=0;i<8;i++ {sink=append(sink,make([]byte,1024*1024))};span.SetAttributes(attribute.Int("workload.max_mib",8));runtime.KeepAlive(sink)}
func runtimeSnapshot(w http.ResponseWriter,r *http.Request){
 var m runtime.MemStats;runtime.ReadMemStats(&m)
 gcMutex.Lock();defer gcMutex.Unlock()
 events:=[]gcEvent{}
 firstGC:=lastGC; if m.NumGC>firstGC+uint32(len(m.PauseNs)) { firstGC=m.NumGC-uint32(len(m.PauseNs)) }; for i:=firstGC;i<m.NumGC;i++ {idx:=i%uint32(len(m.PauseNs));events=append(events,gcEvent{At:time.Unix(0,int64(m.PauseEnd[idx])).UTC().Format(time.RFC3339Nano),Collector:"Go stop-the-world pause",Cause:"not exposed",DurationMS:float64(m.PauseNs[idx])/1e6,BeforeBytes:0,AfterBytes:0})}
 lastGC=m.NumGC
 // Process CPU is user + system time; the total class also includes idle capacity.
 cpuSample:=[]metrics.Sample{{Name:"/cpu/classes/user:cpu-seconds"},{Name:"/cpu/classes/system:cpu-seconds"}};metrics.Read(cpuSample)
 now:=time.Now();cpu:=0.0
 if cpuSample[0].Value.Kind()==metrics.KindFloat64 && cpuSample[1].Value.Kind()==metrics.KindFloat64 {current:=cpuSample[0].Value.Float64()+cpuSample[1].Value.Float64();if current>=lastCPUTime {cpu=(current-lastCPUTime)/now.Sub(lastCPUAt).Seconds()*100};lastCPUTime=current};lastCPUAt=now
 gcTime:=float64(m.PauseTotalNs)/1e6
 jsonOut(w,200,map[string]any{"sampledAt":time.Now().UTC(),"uptimeMs":time.Since(start).Milliseconds(),"heapUsed":m.HeapAlloc,"heapCommitted":m.HeapSys,"heapMax":-1,"nonHeapUsed":m.StackSys+m.MSpanSys+m.MCacheSys+m.GCSys,"threads":runtime.NumGoroutine(),"cpuPercent":cpu,"allocationBytes":m.TotalAlloc,"gcCount":m.NumGC,"gcTimeMs":gcTime,"runtimeVersion":runtime.Version(),"pools":[]pool{{"Heap in use",m.HeapInuse,m.HeapInuse,-1},{"Heap idle",m.HeapIdle,m.HeapIdle,-1},{"Stacks",m.StackInuse,m.StackSys,-1},{"Runtime metadata",m.MSpanInuse+m.MCacheInuse,m.MSpanSys+m.MCacheSys,-1}},"events":events,"collectors":[]map[string]any{{"name":"Go STW pauses","count":m.NumGC,"timeMs":gcTime}}})
}
func main(){
 if len(os.Args)>1 && os.Args[1]=="-healthcheck" { client:=http.Client{Timeout:2*time.Second};response,err:=client.Get("http://127.0.0.1:8003/health");if err!=nil||response.StatusCode!=200 {os.Exit(1)};response.Body.Close();os.Exit(0) }
 ctx,cancel:=signal.NotifyContext(context.Background(),syscall.SIGTERM,syscall.SIGINT);defer cancel()
 res,err:=resource.Merge(resource.Default(),resource.NewSchemaless(attribute.String("service.name","assets"),attribute.String("service.namespace","racmond-lab")));if err!=nil{log.Fatal(err)}
 endpoint:=strings.TrimPrefix(env("OTEL_EXPORTER_OTLP_ENDPOINT","http://otel-collector:4318"),"http://")
 exporter,err:=otlptracehttp.New(ctx,otlptracehttp.WithEndpoint(endpoint),otlptracehttp.WithInsecure());if err!=nil{log.Fatal(err)}
 tp:=sdktrace.NewTracerProvider(sdktrace.WithBatcher(exporter),sdktrace.WithResource(res));otel.SetTracerProvider(tp);otel.SetTextMapPropagator(propagation.TraceContext{})
 metricsExporter,err:=otlpmetrichttp.New(ctx,otlpmetrichttp.WithEndpoint(endpoint),otlpmetrichttp.WithInsecure());if err!=nil{log.Fatal(err)}
 mp:=sdkmetric.NewMeterProvider(sdkmetric.WithResource(res),sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricsExporter)));otel.SetMeterProvider(mp)
 if err=otelruntime.Start(otelruntime.WithMeterProvider(mp));err!=nil{log.Fatal(err)}
 db=redis.NewClient(&redis.Options{Addr:env("REDIS_ADDR","redis:6379"),Password:os.Getenv("REDIS_PASSWORD")})
 if err=db.Ping(ctx).Err();err!=nil{log.Fatal(err)}
 if err=db.XGroupCreateMkStream(ctx,"orders.accepted","accounting","0").Err();err!=nil&&!strings.Contains(err.Error(),"BUSYGROUP"){log.Fatal(err)}
 mux:=http.NewServeMux()
 mux.HandleFunc("/health",func(w http.ResponseWriter,r *http.Request){if err:=db.Ping(r.Context()).Err();err!=nil{jsonOut(w,503,map[string]string{"error":"Redis unavailable"});return};jsonOut(w,200,map[string]any{"ok":true,"service":"assets"})})
 mux.HandleFunc("/allocations",secure(allocate));mux.HandleFunc("/internal/runtime",secure(runtimeSnapshot))
 server:=&http.Server{Addr:"0.0.0.0:8003",Handler:otelhttp.NewHandler(mux,"assets"),ReadHeaderTimeout:5*time.Second,ReadTimeout:10*time.Second,WriteTimeout:10*time.Second}
 shutdownDone:=make(chan struct{})
 go func(){<-ctx.Done();shutdown,cancel:=context.WithTimeout(context.Background(),5*time.Second);defer cancel();server.Shutdown(shutdown);tp.Shutdown(shutdown);mp.Shutdown(shutdown);db.Close();close(shutdownDone)}()
 fmt.Println("Racmond assets listening on :8003");if err:=server.ListenAndServe();err!=nil&&!errors.Is(err,http.ErrServerClosed){log.Fatal(err)};<-shutdownDone
}
