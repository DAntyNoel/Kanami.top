ARG GO_BUILDER_IMAGE=golang:1.26-alpine
ARG RUNTIME_IMAGE=alpine:3.23

FROM ${GO_BUILDER_IMAGE} AS builder

WORKDIR /app

ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}

COPY cliproxyapi/go.mod cliproxyapi/go.sum ./
RUN go mod download

COPY cliproxyapi/ ./

ARG VERSION=dev
ARG COMMIT=none
ARG BUILD_DATE=unknown

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w -X 'main.Version=${VERSION}' -X 'main.Commit=${COMMIT}' -X 'main.BuildDate=${BUILD_DATE}'" -o ./CLIProxyAPI ./cmd/server/

FROM ${RUNTIME_IMAGE}

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /CLIProxyAPI

COPY --from=builder /app/CLIProxyAPI /CLIProxyAPI/CLIProxyAPI
COPY --from=builder /app/config.example.yaml /CLIProxyAPI/config.example.yaml
COPY start_script.sh /CLIProxyAPI/start_script.sh

EXPOSE 8317

ENV TZ=Asia/Shanghai

RUN cp /usr/share/zoneinfo/${TZ} /etc/localtime \
  && echo "${TZ}" > /etc/timezone \
  && sed -i 's/\r$//' /CLIProxyAPI/start_script.sh \
  && chmod +x /CLIProxyAPI/start_script.sh

CMD ["./start_script.sh"]
