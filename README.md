# Ultimate UI - EPG Management Interface

A modern, responsive web interface for managing Electronic Program Guide (EPG) data with integration to multiple backends.

## Features

- **Four-tab Interface**: EPG Display, Configuration, EPG Mapping, and Monitoring
- **Responsive Design**: Works on desktop and mobile devices
- **Multiple Backend Support**: Integrates with WebEPG and Ultimate Backend
- **Channel Mapping**: Map channels between different EPG sources
- **Real-time Monitoring**: Track import jobs and system health
- **Docker Support**: Easy deployment with Docker and Docker Compose

## Architecture
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Ultimate UI │────│ WebEPG │────│ XMLTV Sources │
│ (Flask App) │ │ (Backend) │ │ │
└─────────────────┘ └─────────────────┘ └─────────────────┘
│ │
│ ┌─────────────────┐
└──────────────│ Ultimate Backend│
│ (Channels) │
└─────────────────┘

text

## Quick Start

### Using Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ultimate-ui.git
cd ultimate-ui
Create configuration files:

bash
mkdir -p config
cp config/config.example.yaml config/config.yaml
Update the configuration:

yaml
# config/config.yaml
webepg:
  url: "http://localhost:8080"
ultimate_backend:
  url: "http://localhost:3000"
Start the services:

bash
docker-compose up -d
Open your browser:

Ultimate UI: http://localhost:5000

WebEPG Backend: http://localhost:8080

Ultimate Backend: http://localhost:3000

Manual Installation
Install Python dependencies:

bash
pip install -r requirements.txt
Set environment variables:

bash
export FLASK_APP=src.app
export FLASK_ENV=development
export ULTIMATE_UI_CONFIG=config/config.yaml
Run the application:

bash
python -m flask run --host=0.0.0.0 --port=5000
Configuration
Backend URLs
Configure the backend URLs in config/config.yaml:

yaml
webepg:
  url: "http://your-webepg-server:8080"
  timeout: 10

ultimate_backend:
  url: "http://your-ultimate-backend:3000"
  timeout: 10
Environment Variables
Variable	Description	Default
ULTIMATE_UI_CONFIG	Path to config file	config/config.yaml
WEBEPG_URL	WebEPG backend URL	http://localhost:8080
ULTIMATE_BACKEND_URL	Ultimate backend URL	http://localhost:3000
UI_THEME	UI theme (dark/light)	dark
UI_REFRESH_INTERVAL	Auto-refresh interval (seconds)	300
API Endpoints
Ultimate UI API
Endpoint	Method	Description
/api/epg/refresh	GET	Refresh EPG data
/api/import/trigger	POST	Trigger import job
/api/mapping/providers	GET	Get providers from ultimate backend
/api/mapping/channels/{id}	GET	Get channels for a provider
/api/mapping/create-alias	POST	Create channel alias
/api/monitoring/status	GET	Get monitoring status
Integration with WebEPG
Ultimate UI requires the following WebEPG endpoints:

GET /api/v1/channels - List all channels

GET /api/v1/channels/{id}/programs - Get programs for a channel

GET /api/v1/providers - List EPG providers

POST /api/v1/import/trigger - Trigger import

GET /api/v1/import/status - Get import status

POST /api/v1/channels/{id}/aliases - Create channel alias

Integration with Ultimate Backend
Ultimate UI requires the following Ultimate Backend endpoints:

GET /api/providers - List available providers

GET /api/providers/{id}/channels - Get channels for a provider

Development
Setup Development Environment
Install development dependencies:

bash
pip install -r requirements.dev.txt
Start development services:

bash
docker-compose -f docker-compose.dev.yml up -d
Run the application in development mode:

bash
python -m flask run --host=0.0.0.0 --port=5000 --reload
Running Tests
bash
pytest tests/ -v
Code Quality
bash
# Format code
black src/

# Check code style
flake8 src/

# Type checking
mypy src/
Deployment
Production with Docker
Build the production image:

bash
docker build -t ultimate-ui:latest .
Run with Docker Compose:

bash
docker-compose -f docker-compose.prod.yml up -d
Production with Kubernetes
Example deployment configuration in kubernetes/ directory:

bash
kubectl apply -f kubernetes/namespace.yaml
kubectl apply -f kubernetes/config.yaml
kubectl apply -f kubernetes/deployment.yaml
kubectl apply -f kubernetes/service.yaml
kubectl apply -f kubernetes/ingress.yaml
Monitoring
Ultimate UI includes built-in monitoring:

Health Checks: All services have health check endpoints

Metrics: Prometheus metrics available at /metrics

Logging: Structured JSON logging for production

Tracing: Distributed tracing with OpenTelemetry

Troubleshooting
Common Issues
Backend connection errors:

Check backend URLs in configuration

Verify network connectivity

Check backend service health

EPG data not loading:

Verify WebEPG backend is running

Check import job status

Verify database connectivity

Mobile display issues:

Clear browser cache

Check responsive CSS

Test on different screen sizes

Logs
bash
# Docker Compose logs
docker-compose logs -f ultimate-ui

# Application logs
tail -f logs/ultimate-ui.log

# Access logs
tail -f logs/access.log
Contributing
Fork the repository

Create a feature branch

Make your changes

Add tests

Run the test suite

Submit a pull request

License
MIT License - see LICENSE file for details.

Support
Documentation: docs.ultimate-ui.local

Issues: GitHub Issues

Discussions: GitHub Discussions

