FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
# Maven Central serves the agent directly; verify it so an HTML error page can never become a runtime JAR.
ADD https://repo.maven.apache.org/maven2/io/opentelemetry/javaagent/opentelemetry-javaagent/2.15.0/opentelemetry-javaagent-2.15.0.jar /otel-agent.jar
RUN echo "7ecffb5fdda5d2e0fd0125abaffa218146a23dc2402d5c7b30cf5a2f2c3ff241  /otel-agent.jar" | sha256sum -c -
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src src
RUN mvn -B package -DskipTests
FROM eclipse-temurin:21-jre-jammy
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* && useradd -r -u 10001 app
WORKDIR /app
COPY --from=build /otel-agent.jar /app/otel-agent.jar
COPY --from=build /app/target/accounting-0.1.0.jar app.jar
USER app
EXPOSE 8004
ENTRYPOINT ["java","-javaagent:/app/otel-agent.jar","-Xms64m","-Xmx256m","-XX:+UseG1GC","-jar","app.jar"]
