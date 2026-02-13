#!/bin/bash
# Startup script for all services

echo "🚀 Starting Slave Node System..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start with Docker Compose
echo "📦 Starting services with Docker Compose..."
docker-compose -f docker-compose.slave-nodes.yml up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo ""
echo "🔍 Checking service health..."
curl -s http://localhost:8000/health | python -m json.tool || echo "⚠️  Backend not ready yet"

echo ""
echo "✅ System started!"
echo ""
echo "📊 Dashboard: http://localhost:3001"
echo "🔌 Backend API: http://localhost:8000"
echo "📖 API Docs: http://localhost:8000/docs"
echo ""
echo "📝 To view logs:"
echo "   docker-compose -f docker-compose.slave-nodes.yml logs -f"
echo ""
echo "🛑 To stop:"
echo "   docker-compose -f docker-compose.slave-nodes.yml down"
echo ""
