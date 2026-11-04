package io.racmond.accounting;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.trace.*;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import io.opentelemetry.context.propagation.TextMapGetter;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.redis.connection.stream.*;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import jakarta.annotation.PostConstruct;
import java.lang.management.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedDeque;
import javax.management.NotificationEmitter;
import javax.management.openmbean.CompositeData;
import com.sun.management.GarbageCollectionNotificationInfo;

@SpringBootApplication @EnableScheduling
public class AccountingApplication {
    private static final Logger log = LoggerFactory.getLogger(AccountingApplication.class);
    private final JdbcTemplate jdbc;
    private final StringRedisTemplate redis;
    private final TransactionTemplate tx;
    private final Tracer tracer = GlobalOpenTelemetry.getTracer("racmond.accounting");
    private final Deque<Map<String,Object>> gcEvents = new ConcurrentLinkedDeque<>();
    private final Instant started = Instant.now();
    private volatile byte[][] pressureSink;
    public AccountingApplication(JdbcTemplate jdbc, StringRedisTemplate redis, TransactionTemplate tx) { this.jdbc=jdbc;this.redis=redis;this.tx=tx; }
    public static void main(String[] args) { SpringApplication.run(AccountingApplication.class,args); }
    @PostConstruct void setup() {
        // MKSTREAM avoids a startup race with the Go producer: the stream may not exist yet.
        // Spring/Lettuce may wrap BUSYGROUP, so inspect the whole cause chain.
        try { redis.execute((RedisCallback<String>) connection -> connection.streamCommands().xGroupCreate("orders.accepted".getBytes(StandardCharsets.UTF_8), "accounting", ReadOffset.from("0"), true)); } catch (Exception e) { if (!isBusyGroup(e)) throw e; }
        for (GarbageCollectorMXBean bean : ManagementFactory.getGarbageCollectorMXBeans()) {
            if (bean instanceof NotificationEmitter emitter) emitter.addNotificationListener((notification,handback) -> {
                if (!GarbageCollectionNotificationInfo.GARBAGE_COLLECTION_NOTIFICATION.equals(notification.getType())) return;
                var info=GarbageCollectionNotificationInfo.from((CompositeData)notification.getUserData());
                Set<String> heapPools=new HashSet<>();for(var p:ManagementFactory.getMemoryPoolMXBeans())if(p.getType()==MemoryType.HEAP)heapPools.add(p.getName());
                long before=info.getGcInfo().getMemoryUsageBeforeGc().entrySet().stream().filter(e->heapPools.contains(e.getKey())&&e.getValue()!=null).mapToLong(e->e.getValue().getUsed()).sum();
                long after=info.getGcInfo().getMemoryUsageAfterGc().entrySet().stream().filter(e->heapPools.contains(e.getKey())&&e.getValue()!=null).mapToLong(e->e.getValue().getUsed()).sum();
                gcEvents.addLast(Map.of("at",Instant.now().toString(),"collector",info.getGcName(),"cause",info.getGcCause(),"durationMs",info.getGcInfo().getDuration(),"beforeBytes",before,"afterBytes",after));
                while(gcEvents.size()>100) gcEvents.pollFirst();
            },null,null);
        }
    }
    private static boolean isBusyGroup(Throwable error) {
        for (Throwable t=error;t!=null;t=t.getCause()) {
            if ("RedisBusyException".equals(t.getClass().getSimpleName()) || String.valueOf(t.getMessage()).contains("BUSYGROUP")) return true;
        }
        return false;
    }
    private static final TextMapGetter<Map<Object,Object>> GETTER = new TextMapGetter<>() {
        public Iterable<String> keys(Map<Object,Object> carrier) { return carrier.keySet().stream().map(Object::toString).toList(); }
        public String get(Map<Object,Object> carrier,String key) { Object v=carrier.get(key);return v==null?null:v.toString(); }
    };
    @Scheduled(fixedDelay=400) void consume() {
        // Fixed consumer identity and pending-first reads provide recovery after a crash.
        for (String offset : List.of("0-0",">")) {
            var records=redis.opsForStream().read(Consumer.from("accounting","worker-1"),StreamReadOptions.empty().count(10).block(Duration.ofMillis(150)),StreamOffset.create("orders.accepted",offset.equals(">")?ReadOffset.lastConsumed():ReadOffset.from(offset)));
            if(records==null) continue;
            for(MapRecord<String,Object,Object> record:records) {
                Map<Object,Object> f=record.getValue();
                Context parent=GlobalOpenTelemetry.getPropagators().getTextMapPropagator().extract(Context.root(),f,GETTER);
                Span span=tracer.spanBuilder("orders.accepted process").setParent(parent).setSpanKind(SpanKind.CONSUMER).setAttribute("messaging.system","redis_streams").setAttribute("messaging.destination.name","orders.accepted").startSpan();
                try(Scope scope=span.makeCurrent()) {
                    String orderId=Objects.toString(f.get("orderId"),""), assetId=Objects.toString(f.get("assetId"),"");
                    long amount=Long.parseLong(Objects.toString(f.get("amountCents"),"0"));
                    UUID.fromString(orderId);
                    if(amount<240000||amount>2400000||amount%240000!=0||assetId.isBlank()) throw new IllegalArgumentException("Invalid message envelope");
                    span.setAttribute("order.id",orderId);
                    if("slow-db".equals(f.get("scenario"))) jdbc.queryForObject("SELECT pg_sleep(0.85)",String.class);
                    if("gc-pressure".equals(f.get("scenario"))) { byte[][] sink=new byte[24][];for(int i=0;i<sink.length;i++)sink[i]=new byte[1024*1024];pressureSink=sink;pressureSink=null; }
                    String invoiceId="INV-"+orderId;
                    tx.executeWithoutResult(status -> {
                        int inserted=jdbc.update("INSERT INTO invoices(id,order_id,amount_cents) VALUES(?,?,?) ON CONFLICT (order_id) DO NOTHING",invoiceId,UUID.fromString(orderId),amount);
                        if(inserted==1) {
                            jdbc.update("INSERT INTO journal_entries(invoice_id,account,debit_cents,credit_cents) VALUES(?,'accounts_receivable',?,0)",invoiceId,amount);
                            jdbc.update("INSERT INTO journal_entries(invoice_id,account,credit_cents,debit_cents) VALUES(?,'infrastructure_revenue',?,0)",invoiceId,amount);
                        }
                        // A replay must still notify CRM, but it must never create a second journal.
                        // The original trace and each replay trace get at most one outbox row.
                        Map<String,String> carrier=new HashMap<>();
                        GlobalOpenTelemetry.getPropagators().getTextMapPropagator().inject(Context.current(),carrier,(c,k,v)->c.put(k,v));
                        jdbc.update("INSERT INTO outbox(invoice_id,order_id,asset_id,amount_cents,traceparent) VALUES(?,?,?,?,?) ON CONFLICT (invoice_id,traceparent) DO NOTHING",invoiceId,UUID.fromString(orderId),assetId,amount,carrier.getOrDefault("traceparent",""));
                    });
                    redis.opsForStream().acknowledge("orders.accepted","accounting",record.getId());
                } catch(Exception e) { log.error("orders.accepted processing failed for {}", record.getId(), e); span.recordException(e);span.setStatus(StatusCode.ERROR); } finally { span.end(); }
            }
        }
    }
    @Scheduled(fixedDelay=500) void publishOutbox() {
        var rows=jdbc.queryForList("SELECT * FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 20");
        for(var row:rows) {
            Map<String,String> carrier=Map.of("traceparent",Objects.toString(row.get("traceparent"),""));
            Context parent=GlobalOpenTelemetry.getPropagators().getTextMapPropagator().extract(Context.root(),carrier,new TextMapGetter<Map<String,String>>(){public Iterable<String> keys(Map<String,String> c){return c.keySet();}public String get(Map<String,String> c,String k){return c.get(k);}});
            Span span=tracer.spanBuilder("invoice.posted publish").setParent(parent).setSpanKind(SpanKind.PRODUCER).setAttribute("messaging.system","redis_streams").startSpan();
            try(Scope scope=span.makeCurrent()) {
                Map<String,String> fields=new HashMap<>(Map.of("schema","1","orderId",row.get("order_id").toString(),"invoiceId",row.get("invoice_id").toString(),"assetId",row.get("asset_id").toString(),"amountCents",row.get("amount_cents").toString()));
                GlobalOpenTelemetry.getPropagators().getTextMapPropagator().inject(Context.current(),fields,(c,k,v)->c.put(k,v));
                redis.opsForStream().add(StreamRecords.string(fields).withStreamKey("invoice.posted"));
                jdbc.update("UPDATE outbox SET published_at=now() WHERE id=?",row.get("id"));
            }catch(Exception e){log.error("invoice.posted publication failed for outbox {}", row.get("id"), e);span.recordException(e);span.setStatus(StatusCode.ERROR);}finally{span.end();}
        }
    }
    @GetMapping("/internal/runtime") Map<String,Object> runtime() {
        MemoryMXBean memory=ManagementFactory.getMemoryMXBean();
        var operating=(com.sun.management.OperatingSystemMXBean)ManagementFactory.getOperatingSystemMXBean();
        List<Map<String,Object>> pools=new ArrayList<>();
        for(var pool:ManagementFactory.getMemoryPoolMXBeans()) pools.add(Map.of("name",pool.getName(),"used",pool.getUsage().getUsed(),"committed",pool.getUsage().getCommitted(),"max",pool.getUsage().getMax()));
        List<Map<String,Object>> collectors=new ArrayList<>();long count=0,time=0;
        for(var gc:ManagementFactory.getGarbageCollectorMXBeans()){count+=Math.max(0,gc.getCollectionCount());time+=Math.max(0,gc.getCollectionTime());collectors.add(Map.of("name",gc.getName(),"count",gc.getCollectionCount(),"timeMs",gc.getCollectionTime()));}
        Map<String,Object> result=new HashMap<>();
        result.put("sampledAt",Instant.now().toString());result.put("uptimeMs",ManagementFactory.getRuntimeMXBean().getUptime());result.put("heapUsed",memory.getHeapMemoryUsage().getUsed());result.put("heapCommitted",memory.getHeapMemoryUsage().getCommitted());result.put("heapMax",memory.getHeapMemoryUsage().getMax());result.put("nonHeapUsed",memory.getNonHeapMemoryUsage().getUsed());result.put("threads",ManagementFactory.getThreadMXBean().getThreadCount());result.put("cpuPercent",Math.max(0,operating.getProcessCpuLoad()*100));result.put("allocationBytes",0);result.put("gcCount",count);result.put("gcTimeMs",time);result.put("pools",pools);result.put("collectors",collectors);result.put("events",new ArrayList<>(gcEvents));result.put("runtimeVersion",System.getProperty("java.vm.name")+" "+System.getProperty("java.version"));return result;
    }
}
