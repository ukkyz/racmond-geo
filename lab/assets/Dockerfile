FROM golang:1.24-bookworm AS build
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -trimpath -o /assets .
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /assets /assets
EXPOSE 8003
ENTRYPOINT ["/assets"]
