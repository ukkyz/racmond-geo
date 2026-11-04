<?php
use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;
use MongoDB\Client;
use OpenTelemetry\API\Globals;
use OpenTelemetry\API\Trace\SpanKind;
use OpenTelemetry\API\Trace\StatusCode;
use OpenTelemetry\API\Trace\Propagation\TraceContextPropagator;
use OpenTelemetry\Context\Context;
use App\Http\Middleware\LabAuth;

function labSpan(string $name, callable $fn, array $attributes = [], $parent = null) {
    $builder = Globals::tracerProvider()->getTracer('racmond.crm')->spanBuilder($name)->setSpanKind(SpanKind::KIND_CLIENT);
    if ($parent !== null) $builder->setParent($parent);
    foreach ($attributes as $key=>$value) $builder->setAttribute($key, $value);
    $span = $builder->startSpan();
    $scope = $span->activate();
    try { return $fn(); } catch (\Throwable $e) { $span->recordException($e); $span->setStatus(StatusCode::STATUS_ERROR); throw $e; }
    finally { $scope->detach(); $span->end(); }
}
function labRequestSpan(Request $request, string $name, callable $fn) {
    $parent = TraceContextPropagator::getInstance()->extract(['traceparent'=>$request->header('traceparent',''),'tracestate'=>$request->header('tracestate','')]);
    $span = Globals::tracerProvider()->getTracer('racmond.crm')->spanBuilder($name)->setParent($parent)->setSpanKind(SpanKind::KIND_SERVER)->startSpan();
    $scope = $span->activate();
    try { return $fn($span); } catch (\Throwable $e) { $span->recordException($e); $span->setStatus(StatusCode::STATUS_ERROR); throw $e; }
    finally { $scope->detach(); $span->end(); }
}
Route::get('/health', function () {
    app(Client::class)->selectDatabase('racmond')->command(['ping'=>1]);
    return response()->json(['ok'=>true,'service'=>'crm']);
});
Route::middleware(LabAuth::class)->group(function () {
    Route::post('/orders', function (Request $request) {
        return labRequestSpan($request, 'POST /api/orders', function () use ($request) {
        $data = $request->validate(['id'=>'required|uuid','quantity'=>'required|integer|min:1|max:10','amountCents'=>'required|integer|min:240000|max:2400000','scenario'=>'required|in:happy,slow-db,credit-decline,stock-conflict,duplicate-replay,gc-pressure']);
        if ($data['amountCents'] !== $data['quantity'] * 240000) return response()->json(['error'=>'Amount does not match catalog price.'],422);
        $orders = app(Client::class)->selectDatabase('racmond')->orders;
        $existing = labSpan('mongodb orders.findOne', fn() => $orders->findOne(['id'=>$data['id']]), ['db.system'=>'mongodb']);
        $traceId = \OpenTelemetry\API\Trace\Span::getCurrent()->getContext()->getTraceId();
        if ($existing) {
            labSpan('mongodb orders.replay', fn() => $orders->updateOne(['id'=>$data['id']],['$set'=>['traceId'=>$traceId,'replayed'=>true]]), ['db.system'=>'mongodb']);
            return response()->json(['id'=>$data['id'],'replayed'=>true]);
        }
        $approved = $data['scenario'] !== 'credit-decline' && $data['amountCents'] <= 10000000;
        $record = ['id'=>$data['id'],'customerId'=>'C-100','quantity'=>$data['quantity'],'amountCents'=>$data['amountCents'],'scenario'=>$data['scenario'],'status'=>$approved?'pending':'rejected','traceId'=>$traceId,'createdAt'=>gmdate('c'),'replayed'=>false,'invoiceId'=>null,'assetId'=>null,'message'=>$approved?'Credit approved; awaiting accounting.':'Credit limit exceeded. No reservation requested.'];
        labSpan('mongodb orders.insertOne', fn() => $orders->insertOne($record), ['db.system'=>'mongodb','credit.decision'=>$approved?'approved':'declined']);
        return response()->json($record, $approved?201:422);
        });
    });
    Route::get('/orders/{id}', function (Request $request, string $id) {
        return labRequestSpan($request, 'GET /api/orders/{id}', function () use ($id) {
        if (!preg_match('/^[a-f0-9-]{36}$/i',$id)) abort(422);
        $order = labSpan('mongodb orders.findOne', fn() => app(Client::class)->selectDatabase('racmond')->orders->findOne(['id'=>$id]), ['db.system'=>'mongodb']);
        if (!$order) return response()->json(['error'=>'Order not found'],404);
        $result = (array)$order; unset($result['_id']); return response()->json($result);
        });
    });
    Route::post('/orders/{id}/reject', function (Request $request, string $id) {
        return labRequestSpan($request, 'POST /api/orders/{id}/reject', function () use ($request, $id) {
        if (!preg_match('/^[a-f0-9-]{36}$/i', $id)) abort(422);
        $data = $request->validate(['reason'=>'nullable|string|max:250','status'=>'nullable|in:failed,rejected,pending']);
        $status = $data['status'] ?? 'failed';
        labSpan('mongodb orders.reject', fn() => app(Client::class)->selectDatabase('racmond')->orders->updateOne(['id'=>$id,'status'=>'pending'],['$set'=>['status'=>$status,'message'=>$data['reason'] ?? 'Upstream failure']]), ['db.system'=>'mongodb']);
        return response()->json(['ok'=>true]);
        });
    });
});
