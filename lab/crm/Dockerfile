FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json ./
# Extensions are installed in the runtime stage; Composer only resolves PHP packages here.
RUN composer install --no-dev --prefer-dist --no-interaction --no-scripts --no-progress --ignore-platform-reqs
FROM php:8.3-cli-bookworm
COPY --from=mlocati/php-extension-installer /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions mongodb redis opentelemetry protobuf pcntl
WORKDIR /app
COPY --from=vendor /app/vendor vendor
COPY . .
RUN mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache && chown -R www-data:www-data storage bootstrap
USER www-data
EXPOSE 8001
CMD ["php", "-S", "0.0.0.0:8001", "-t", "public", "public/index.php"]
