<?php
// Simple API proxy for Rise Lead Scraper
// This proxies requests to the local Node.js API

$api_base = 'http://127.0.0.1:3001';

// Get the request path
$path = isset($_GET['path']) ? $_GET['path'] : '';
if (empty($path)) {
    $path = '/health';
}

// Ensure path starts with /
if ($path[0] !== '/') {
    $path = '/' . $path;
}

$url = $api_base . $path;

// Get request method
$method = $_SERVER['REQUEST_METHOD'];

// Set up cURL
$ch = curl_init();

// Handle different HTTP methods
switch ($method) {
    case 'POST':
    case 'PUT':
    case 'DELETE':
        $input = file_get_contents('php://input');
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        if ($input) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $input);
        }
        break;
}

// Set cURL options
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 120);

// Forward headers
$headers = [];
$headers[] = 'Content-Type: application/json';
if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $headers[] = 'Authorization: ' . $_SERVER['HTTP_AUTHORIZATION'];
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

// Get response headers
$response_headers = [];
curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($curl, $header) use (&$response_headers) {
    $len = strlen($header);
    $header = explode(':', $header, 2);
    if (count($header) < 2) return $len;
    $response_headers[strtolower(trim($header[0]))] = trim($header[1]);
    return $len;
});

// Execute request
$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

// Set response headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle OPTIONS preflight
if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Return error if cURL failed
if ($error) {
    http_response_code(500);
    echo json_encode(['error' => 'Proxy error: ' . $error]);
    exit;
}

// Return the response
http_response_code($http_code);
echo $response;
