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
        $redis = new \Redis();
        $redis->connect(getenv('REDIS_HOST') ?: 'redis', 6379, 5);
        $auth = getenv('REDIS_PASSWORD'); if ($auth) $redis->auth($auth);
        try { $redis->rawCommand('XGROUP','CREATE','invoice.posted','crm','0','MKSTREAM'); } catch (\RedisException $e) { if (!str_contains($e->getMessage(),'BUSYGROUP')) throw $e; }
        $db = app(Client::class)->selectDatabase('racmond');
        while (true) {
            // Fixed consumer name: reading ID 0 recovers this consumer's pending entries after restart.
            $batches = $redis->rawCommand('XREADGROUP','GROUP','crm','worker-1','COUNT',10,'BLOCK',1000,'STREAMS','invoice.posted','0');
            if (!$batches) $batches = $redis->rawCommand('XREADGROUP','GROUP','crm','worker-1','COUNT',10,'BLOCK',1000,'STREAMS','invoice.posted','>');
            foreach (($batches ?: []) as $stream) foreach ($stream[1] as $message) {
                $fields = $message[1]; $f = [];
                for ($i=0;$i<count($fields);$i+=2) $f[$fields[$i]]=$fields[$i+1];
                $parent = TraceContextPropagator::getInstance()->extract(['traceparent'=>$f['traceparent'] ?? '']);
                $span = Globals::tracerProvider()->getTracer('racmond.crm')->spanBuilder('invoice.posted process')->setParent($parent)->setSpanKind(SpanKind::KIND_CONSUMER)->setAttribute('messaging.system','redis_streams')->setAttribute('messaging.destination.name','invoice.posted')->startSpan();
                $scope = $span->activate();
                try {
                    $db->orders->updateOne(['id'=>$f['orderId']],['$set'=>['status'=>'completed','invoiceId'=>$f['invoiceId'],'assetId'=>$f['assetId'],'message'=>'Invoice posted and customer notification recorded.']]);
                    $db->notifications->updateOne(['invoiceId'=>$f['invoiceId']],['$set'=>['invoiceId'=>$f['invoiceId'],'orderId'=>$f['orderId'],'customerId'=>'C-100','channel'=>'synthetic-email','createdAt'=>gmdate('c')]],['upsert'=>true]);
                    $redis->xack('invoice.posted','crm',[$message[0]]);
                } catch (\Throwable $e) { $span->recordException($e); $span->setStatus(StatusCode::STATUS_ERROR); $this->error($e->getMessage()); sleep(1); }
                finally { $scope->detach(); $span->end(); }
            }
        }
        return 0;
    }
}
