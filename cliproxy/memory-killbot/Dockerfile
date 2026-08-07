ARG GO_BUILDER_IMAGE=golang:1.26-alpine

FROM ${GO_BUILDER_IMAGE} AS builder
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN go test ./...
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/cliproxy-memory-killbot ./cmd/cliproxy-memory-killbot

FROM scratch
COPY --from=builder /out/cliproxy-memory-killbot /usr/local/bin/cliproxy-memory-killbot
ENTRYPOINT ["/usr/local/bin/cliproxy-memory-killbot"]
CMD ["run"]
