<?php
/**
 * WHMCS Module Hooks
 * 
 * Handles automated actions during product/service lifecycle
 */

if (!defined("WHMCS")) {
    die("This file cannot be accessed directly");
}

/**
 * Hook: AfterModuleCreate
 * Send welcome email with API credentials
 */
add_hook('AfterModuleCreate', 1, function($vars) {
    if ($vars['params']['servertype'] !== 'llmcontainer') {
        return;
    }

    $service = \WHMCS\Service\Service::find($vars['params']['serviceid']);
    $client = $service->client;
    
    $apiEndpoint = $service->serviceProperties->get('API Endpoint');
    $tenantId = $service->serviceProperties->get('Tenant ID');

    // Send custom email with API documentation
    sendMessage('LLM Container Provisioned', $vars['params']['serviceid'], [
        'api_endpoint' => $apiEndpoint,
        'tenant_id' => $tenantId,
        'model' => $vars['params']['configoption1'],
        'engine' => $vars['params']['configoption5'],
    ]);
});

/**
 * Hook: AfterModuleSuspend
 * Log suspension event
 */
add_hook('AfterModuleSuspend', 1, function($vars) {
    if ($vars['params']['servertype'] !== 'llmcontainer') {
        return;
    }

    logActivity("LLM Container suspended for service ID: {$vars['params']['serviceid']}");
});

/**
 * Hook: AfterModuleUnsuspend
 * Log unsuspension event
 */
add_hook('AfterModuleUnsuspend', 1, function($vars) {
    if ($vars['params']['servertype'] !== 'llmcontainer') {
        return;
    }

    logActivity("LLM Container unsuspended for service ID: {$vars['params']['serviceid']}");
});

/**
 * Hook: AfterModuleTerminate
 * Cleanup and send termination notification
 */
add_hook('AfterModuleTerminate', 1, function($vars) {
    if ($vars['params']['servertype'] !== 'llmcontainer') {
        return;
    }

    logActivity("LLM Container terminated for service ID: {$vars['params']['serviceid']}");
    
    // Send termination confirmation
    sendMessage('LLM Container Terminated', $vars['params']['serviceid']);
});

/**
 * Hook: DailyCronJob
 * Collect usage metrics for all active services
 */
add_hook('DailyCronJob', 1, function($vars) {
    $services = \WHMCS\Service\Service::where('producttype', 'llmcontainer')
        ->whereIn('domainstatus', ['Active', 'Suspended'])
        ->get();

    foreach ($services as $service) {
        try {
            // Trigger usage update
            run_hook('UsageUpdate', ['serviceid' => $service->id]);
        } catch (Exception $e) {
            logActivity("Error collecting metrics for service {$service->id}: " . $e->getMessage());
        }
    }
});
