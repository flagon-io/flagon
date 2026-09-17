package metrics

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
)

// pgxCollector exposes pgxpool.Stat as Prometheus metrics, read live on each
// scrape. The connection pool is the usual first bottleneck for a DB-backed
// API: when acquire waits climb, requests are queuing on connections, not CPU,
// which is the signal to raise pool_max_conns or add capacity.
type pgxCollector struct {
	pool *pgxpool.Pool

	acquiredConns    *prometheus.Desc
	idleConns        *prometheus.Desc
	totalConns       *prometheus.Desc
	maxConns         *prometheus.Desc
	acquireCount     *prometheus.Desc
	emptyAcquire     *prometheus.Desc
	canceledAcquire  *prometheus.Desc
	acquireWaitTotal *prometheus.Desc
}

func newPgxCollector(pool *pgxpool.Pool) *pgxCollector {
	ns := "flagon_db_pool"
	d := func(name, help string) *prometheus.Desc {
		return prometheus.NewDesc(ns+"_"+name, help, nil, nil)
	}
	return &pgxCollector{
		pool:             pool,
		acquiredConns:    d("acquired_connections", "Connections currently in use."),
		idleConns:        d("idle_connections", "Idle connections in the pool."),
		totalConns:       d("total_connections", "Total connections (idle + in use)."),
		maxConns:         d("max_connections", "Maximum size of the pool."),
		acquireCount:     d("acquire_total", "Cumulative successful connection acquires."),
		emptyAcquire:     d("empty_acquire_total", "Acquires that had to wait for a connection."),
		canceledAcquire:  d("canceled_acquire_total", "Acquires canceled by context before completing."),
		acquireWaitTotal: d("acquire_wait_seconds_total", "Cumulative time spent waiting to acquire a connection."),
	}
}

func (c *pgxCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- c.acquiredConns
	ch <- c.idleConns
	ch <- c.totalConns
	ch <- c.maxConns
	ch <- c.acquireCount
	ch <- c.emptyAcquire
	ch <- c.canceledAcquire
	ch <- c.acquireWaitTotal
}

func (c *pgxCollector) Collect(ch chan<- prometheus.Metric) {
	if c.pool == nil {
		return // degraded (no database configured) - emit nothing
	}
	s := c.pool.Stat()
	gauge := func(desc *prometheus.Desc, v float64) {
		ch <- prometheus.MustNewConstMetric(desc, prometheus.GaugeValue, v)
	}
	counter := func(desc *prometheus.Desc, v float64) {
		ch <- prometheus.MustNewConstMetric(desc, prometheus.CounterValue, v)
	}
	gauge(c.acquiredConns, float64(s.AcquiredConns()))
	gauge(c.idleConns, float64(s.IdleConns()))
	gauge(c.totalConns, float64(s.TotalConns()))
	gauge(c.maxConns, float64(s.MaxConns()))
	counter(c.acquireCount, float64(s.AcquireCount()))
	counter(c.emptyAcquire, float64(s.EmptyAcquireCount()))
	counter(c.canceledAcquire, float64(s.CanceledAcquireCount()))
	counter(c.acquireWaitTotal, s.AcquireDuration().Seconds())
}
