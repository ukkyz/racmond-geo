FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src src
RUN mvn -B package -DskipTests
FROM eclipse-temurin:21-jre-jammy
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* && useradd -r -u 10001 app
WORKDIR /app
ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.15.0/opentelemetry-javaagent.jar /app/otel-agent.jar
COPY --from=build /app/target/accounting-0.1.0.jar app.jar
USER app
EXPOSE 8004
ENTRYPOINT ["java","-javaagent:/app/otel-agent.jar","-Xms64m","-Xmx256m","-XX:+UseG1GC","-jar","app.jar"]
