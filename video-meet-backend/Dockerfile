# Build stage
FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -e -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

# Run stage
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/video-meet-backend-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8087
ENV SERVER_PORT=8087
ENTRYPOINT ["java","-jar","/app/app.jar","--server.port=8087"]
