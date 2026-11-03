<?php
namespace App\Providers;
use Illuminate\Support\ServiceProvider;
use MongoDB\Client;
class LabServiceProvider extends ServiceProvider {
    public function register(): void {
        $this->app->singleton(Client::class, fn() => new Client(getenv('MONGODB_URL') ?: 'mongodb://mongodb:27017'));
    }
    public function boot(): void {
        $orders = app(Client::class)->selectDatabase('racmond')->orders;
        $orders->createIndex(['id'=>1], ['unique'=>true]);
        app(Client::class)->selectDatabase('racmond')->notifications->createIndex(['invoiceId'=>1], ['unique'=>true]);
    }
}
