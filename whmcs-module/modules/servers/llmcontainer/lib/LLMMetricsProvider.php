<?php
/**
 * LLM Metrics Provider for WHMCS Usage Billing
 * 
 * Collects GPU usage, token consumption, and request metrics
 * from Prometheus/DCGM-Exporter for automated billing.
 * 
 * @package    WHMCS LLM Container
 * @version    1.0.0
 */

use WHMCS\UsageBilling\Contracts\Metrics\ProviderInterface;
use WHMCS\UsageBilling\Contracts\Metrics\MetricInterface;
use WHMCS\Product\Product;
use WHMCS\UsageBilling\Metrics\Metric;
use WHMCS\UsageBilling\Metrics\Units\WholeNumber;
use WHMCS\UsageBilling\Metrics\Units\FloatingPoint;
use WHMCS\UsageBilling\Metrics\Usage;

class LLMMetricsProvider implements ProviderInterface
{
    private $params;
    private $prometheusUrl;

    public function __construct($params)
    {
        $this->params = $params;
        $this->prometheusUrl = getenv('PROMETHEUS_URL') ?: 'http://localhost:9090';
    }

    /**
     * Define metrics available for billing
     */
    public function metrics()
    {
        return [
            new Metric(
                'gpu_hours',
                'GPU Hours',
                MetricInterface::TYPE_PERIOD_MONTH,
                new FloatingPoint('Hours', 2)
            ),
            new Metric(
                'inference_tokens',
                'Tokens Processed',
                MetricInterface::TYPE_PERIOD_MONTH,
                new WholeNumber('Tokens')
            ),
            new Metric(
                'request_count',
                'API Requests',
                MetricInterface::TYPE_PERIOD_MONTH,
                new WholeNumber('Requests')
            ),
            new Metric(
                'vram_gb_hours',
                'VRAM GB-Hours',
                MetricInterface::TYPE_PERIOD_MONTH,
                new FloatingPoint('GB-Hours', 2)
            ),
            new Metric(
                'energy_kwh',
                'Energy Consumption',
                MetricInterface::TYPE_PERIOD_MONTH,
                new FloatingPoint('kWh', 3)
            ),
        ];
    }

    /**
     * Collect usage metrics for a specific tenant
     */
    public function tenantUsage($tenant)
    {
        try {
            $service = \WHMCS\Service\Service::find($tenant);
            $tenantId = $service->serviceProperties->get('Tenant ID');

            $stats = $this->fetchMetricsFromPrometheus($tenantId);

            $metrics = [];

            // GPU Hours metric
            $gpuHours = $stats['gpu_utilization'] * $stats['runtime_hours'] / 100;
            $metrics[] = (new Metric('gpu_hours', 'GPU Hours', 
                MetricInterface::TYPE_PERIOD_MONTH,
                new FloatingPoint('Hours', 2)
            ))->withUsage(new Usage($gpuHours));

            // Inference tokens metric
            $metrics[] = (new Metric('inference_tokens', 'Tokens Processed',
                MetricInterface::TYPE_PERIOD_MONTH,
                new WholeNumber('Tokens')
            ))->withUsage(new Usage($stats['total_tokens']));

            // API requests metric
            $metrics[] = (new Metric('request_count', 'API Requests',
                MetricInterface::TYPE_PERIOD_MONTH,
                new WholeNumber('Requests')
            ))->withUsage(new Usage($stats['request_count']));

            // VRAM GB-Hours metric
            $vramGbHours = ($stats['vram_used_mb'] / 1024) * $stats['runtime_hours'];
            $metrics[] = (new Metric('vram_gb_hours', 'VRAM GB-Hours',
                MetricInterface::TYPE_PERIOD_MONTH,
                new FloatingPoint('GB-Hours', 2)
            ))->withUsage(new Usage($vramGbHours));

            // Energy consumption (kWh)
            $energyKwh = $stats['total_energy_mj'] / 3600; // Convert mJ to kWh
            $metrics[] = (new Metric('energy_kwh', 'Energy Consumption',
                MetricInterface::TYPE_PERIOD_MONTH,
                new FloatingPoint('kWh', 3)
            ))->withUsage(new Usage($energyKwh));

            return $metrics;

        } catch (Exception $e) {
            logModuleCall('llmcontainer', 'tenantUsage', ['tenant' => $tenant], $e->getMessage());
            return [];
        }
    }

    /**
     * Fetch metrics from Prometheus
     */
    private function fetchMetricsFromPrometheus($tenantId)
    {
        $metrics = [
            'gpu_utilization' => 0,
            'runtime_hours' => 0,
            'total_tokens' => 0,
            'request_count' => 0,
            'vram_used_mb' => 0,
            'total_energy_mj' => 0,
        ];

        try {
            // GPU Utilization (average over billing period)
            $query = urlencode(sprintf(
                'avg_over_time(DCGM_FI_DEV_GPU_UTIL{namespace="%s"}[30d])',
                $tenantId
            ));
            $result = $this->queryPrometheus($query);
            $metrics['gpu_utilization'] = $result['value'] ?? 0;

            // Runtime hours (container uptime in last 30 days)
            $query = urlencode(sprintf(
                'sum(time() - container_start_time_seconds{name=~"%s.*"}) / 3600',
                $tenantId
            ));
            $result = $this->queryPrometheus($query);
            $metrics['runtime_hours'] = $result['value'] ?? 0;

            // Total tokens processed
            $query = urlencode(sprintf(
                'sum(increase(vllm_request_tokens_total{namespace="%s"}[30d]))',
                $tenantId
            ));
            $result = $this->queryPrometheus($query);
            $metrics['total_tokens'] = $result['value'] ?? 0;

            // API request count
            $query = urlencode(sprintf(
                'sum(increase(http_requests_total{namespace="%s"}[30d]))',
                $tenantId
            ));
            $result = $this->queryPrometheus($query);
            $metrics['request_count'] = $result['value'] ?? 0;

            // VRAM usage (average)
            $query = urlencode(sprintf(
                'avg_over_time(DCGM_FI_DEV_FB_USED{namespace="%s"}[30d])',
                $tenantId
            ));
            $result = $this->queryPrometheus($query);
            $metrics['vram_used_mb'] = $result['value'] ?? 0;

            // Total energy consumption
            $query = urlencode(sprintf(
                'sum(increase(DCGM_FI_DEV_TOTAL_ENERGY_CONSUMPTION{namespace="%s"}[30d]))',
                $tenantId
            ));
            $result = $this->queryPrometheus($query);
            $metrics['total_energy_mj'] = $result['value'] ?? 0;

        } catch (Exception $e) {
            logModuleCall('llmcontainer', 'fetchMetricsFromPrometheus', 
                ['tenant' => $tenantId], $e->getMessage());
        }

        return $metrics;
    }

    /**
     * Query Prometheus API
     */
    private function queryPrometheus($query)
    {
        $url = $this->prometheusUrl . '/api/v1/query?query=' . $query;
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            throw new Exception("Prometheus query failed: HTTP {$httpCode}");
        }

        $data = json_decode($response, true);

        if ($data['status'] !== 'success') {
            throw new Exception("Prometheus query error: " . ($data['error'] ?? 'Unknown error'));
        }

        if (empty($data['data']['result'])) {
            return ['value' => 0];
        }

        return [
            'value' => (float)$data['data']['result'][0]['value'][1],
        ];
    }

    /**
     * Get current usage metrics for display
     */
    public function getUsageMetrics($tenantId)
    {
        return $this->fetchMetricsFromPrometheus($tenantId);
    }

    /**
     * Collect metrics for WHMCS usage billing update
     */
    public function collectMetrics($tenantId)
    {
        try {
            $stats = $this->fetchMetricsFromPrometheus($tenantId);

            return [
                [
                    'metric' => 'gpu_hours',
                    'value' => $stats['gpu_utilization'] * $stats['runtime_hours'] / 100,
                ],
                [
                    'metric' => 'inference_tokens',
                    'value' => $stats['total_tokens'],
                ],
                [
                    'metric' => 'request_count',
                    'value' => $stats['request_count'],
                ],
                [
                    'metric' => 'vram_gb_hours',
                    'value' => ($stats['vram_used_mb'] / 1024) * $stats['runtime_hours'],
                ],
                [
                    'metric' => 'energy_kwh',
                    'value' => $stats['total_energy_mj'] / 3600,
                ],
            ];

        } catch (Exception $e) {
            logModuleCall('llmcontainer', 'collectMetrics', 
                ['tenant' => $tenantId], $e->getMessage());
            return [];
        }
    }

    /**
     * Calculate billing amount based on usage
     */
    public function calculateBilling($tenantId, $productId)
    {
        $product = Product::find($productId);
        $metrics = $this->getUsageMetrics($tenantId);

        // Get pricing from product configuration
        $pricing = [
            'gpu_hour_rate' => $product->configoptions->getByName('gpu_hour_rate')->value ?? 2.00,
            'token_rate' => $product->configoptions->getByName('token_rate')->value ?? 0.0001,
            'request_rate' => $product->configoptions->getByName('request_rate')->value ?? 0.001,
        ];

        $gpuHours = $metrics['gpu_utilization'] * $metrics['runtime_hours'] / 100;
        $gpuCost = $gpuHours * $pricing['gpu_hour_rate'];
        
        $tokenCost = $metrics['total_tokens'] * $pricing['token_rate'];
        $requestCost = $metrics['request_count'] * $pricing['request_rate'];

        return [
            'gpu_cost' => $gpuCost,
            'token_cost' => $tokenCost,
            'request_cost' => $requestCost,
            'total_cost' => $gpuCost + $tokenCost + $requestCost,
            'breakdown' => [
                'gpu_hours' => $gpuHours,
                'total_tokens' => $metrics['total_tokens'],
                'request_count' => $metrics['request_count'],
            ],
        ];
    }
}
