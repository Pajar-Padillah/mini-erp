FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server
RUN CGO_ENABLED=0 go build -o /out/seed ./cmd/seed
RUN CGO_ENABLED=0 go build -o /out/migrate ./cmd/migrate

FROM alpine:3.20
RUN apk add --no-cache netcat-openbsd && adduser -D -H erp
WORKDIR /app
COPY --from=build /out/server ./server
COPY --from=build /out/seed ./seed
COPY --from=build /out/migrate ./migrate
COPY migrations ./migrations
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && chown -R erp:erp /app
USER erp
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
