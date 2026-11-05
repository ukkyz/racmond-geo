<?php
namespace App\Http\Middleware;
use Closure;
use Illuminate\Http\Request;
class LabAuth {
    public function handle(Request $request, Closure $next) {
        $token = getenv('LAB_INTERNAL_TOKEN') ?: '';
        if (!$token || !hash_equals($token, $request->header('X-Racmond-Lab-Token', ''))) {
            return response()->json(['error'=>'Internal lab authentication required.'], 403);
        }
        return $next($request);
    }
}
