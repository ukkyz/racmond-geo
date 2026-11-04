<?php
namespace App\Console\Commands;
use Illuminate\Console\Command;
use MongoDB\Client;
use OpenTelemetry\API\Globals;
use OpenTelemetry\API\Trace\SpanKind;
use OpenTelemetry\API\Trace\StatusCode;
use OpenTelemetry\API\Trace\Propagation\TraceContextPropagator;
class ConsumeInvoices extends Command {
    protected $signature = 'lab:consume';
    protected $description = 'Consume invoice.posted with explicit W3C context and idempotent notification writes';
    public function handle(): int {
        fwrite(STDERR, "lab:consume starting\n");
        $redis = new \Redis();
        $redis->connect(getenv('REDIS_HOST') ?: 'redis', 6379, 5);
        $auth = getenv('REDIS_PASSWORD'); if ($auth) $redis->auth($auth);
        try { $redis->rawCommand('XGROUP','CREATE','invoice.posted','crm','0','MKSTREAM'); } catch (\RedisException $e) { if (!str_contains($e->getMessage(),'BUSYGROUP')) throw $e; }
        $db = app(Client::class)->selectDatabase('racmond');
        $process = function ($batches) use ($redis, $db): void {
            foreach (($batches ?: []) as $stream) foreach (($stream[1] ?? []) as $message) {
                $fields = $message[1]; $f = [];
                for ($i=0;$i<count($fields);$i+=2) $f[$fields[$i]]=$fields[$i+1];
                $traceparent = trim(explode(',', (string)($f['traceparent'] ?? ''))[0]);
                $parent = TraceContextPropagator::getInstance()->extract(['traceparent'=>$traceparent]);
                $span = Globals::tracerProvider()->getTracer('racmond.crm')->spanBuilder('invoice.posted process')->setParent($parent)->setSpanKind(SpanKind::KIND_CONSUMER)->setAttribute('messaging.system','redis_streams')->setAttribute('messaging.destination.name','invoice.posted')->startSpan();
                $scope = $span->activate();
                try {
                    $db->orders->updateOne(['id'=>$f['orderId']],['$set'=>['status'=>'completed','invoiceId'=>$f['invoiceId'],'assetId'=>$f['assetId'],'message'=>'Invoice posted and customer notification recorded.']]);
                    $db->notifications->updateOne(['invoiceId'=>$f['invoiceId']],['$set'=>['invoiceId'=>$f['invoiceId'],'orderId'=>$f['orderId'],'customerId'=>'C-100','channel'=>'synthetic-email','createdAt'=>gmdate('c')]],['upsert'=>true]);
                    $redis->xack('invoice.posted','crm',[$message[0]]);
                } catch (\Throwable $e) { $span->recordException($e); $span->setStatus(StatusCode::STATUS_ERROR); fwrite(STDERR, 'lab:consume error: '.$e->getMessage()."\n"); sleep(1); }
                finally { $scope->detach(); $span->end(); }
            }
        };
        fwrite(STDERR, "lab:consume ready\n");
        while (true) {
            // Recover pending entries first, then always block for new entries. An empty pending
            // response can still be a truthy stream envelope, so it must not skip the '>' read.
            $process($redis->rawCommand('XREADGROUP','GROUP','crm','worker-1','COUNT','10','STREAMS','invoice.posted','0'));
            $process($redis->rawCommand('XREADGROUP','GROUP','crm','worker-1','COUNT','10','BLOCK','1000','STREAMS','invoice.posted','>'));
        }
        return 0;
    }
}
