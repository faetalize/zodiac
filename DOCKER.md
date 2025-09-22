# Docker Setup for Zodiac

This guide provides instructions for running Zodiac using Docker.

## Prerequisites

- Docker and Docker Compose installed on your system
- (Optional) Your own Supabase project credentials

## Quick Start

### Development Mode

Run the development container with hot-reload:

```bash
# Start the container
npm run docker:dev

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

Access the application at http://localhost:5173

### Production Mode

Build and run the optimized production container:

```bash
# Build the production image
npm run docker:build

# Run the production container
npm run docker:prod

# Stop the container
docker-compose -f docker-compose.prod.yml down
```

Access the application at http://localhost

## Configuration

### Using Your Own Supabase Instance

1. Create a `.env` file from the example:
```bash
cp .env.example .env
```

2. Add your Supabase credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

3. The Docker containers will automatically use these environment variables.

## Docker Architecture

### Multi-Stage Build

The Dockerfile uses a multi-stage build approach:

1. **Builder Stage**: Installs dependencies and builds the application
2. **Production Stage**: Serves the built files with nginx (~20MB image)
3. **Development Stage**: Runs the Vite dev server with hot-reload

### Files Overview

- **Dockerfile**: Multi-stage build configuration
- **docker-compose.yml**: Development environment setup
- **docker-compose.prod.yml**: Production deployment configuration
- **nginx.conf**: Production web server configuration
- **.dockerignore**: Excludes unnecessary files from the build context

### Volume Mounting (Development)

The development setup mounts your local source files for hot-reload:
- Source code is mounted read-only
- Node modules use a named volume to avoid sync issues
- Changes to your local files are immediately reflected

### Production Optimizations

- Gzip compression enabled
- Static asset caching (1 year for assets, 1 hour for HTML)
- Security headers configured
- Health check endpoint at `/health`
- Resource limits configured

## Troubleshooting

### Port Already in Use

If port 5173 (dev) or 80 (prod) is already in use:

```bash
# Change the port mapping in docker-compose.yml
ports:
  - "3000:5173"  # Maps port 3000 to container's 5173
```

### Permission Issues

If you encounter permission issues with Docker:

```bash
# Run with sudo (Linux)
sudo docker-compose up -d

# Or add your user to the docker group
sudo usermod -aG docker $USER
```

### Build Cache Issues

To rebuild without cache:

```bash
docker-compose build --no-cache
docker build --no-cache -t zodiac:latest --target production .
```

### Container Logs

View detailed logs for debugging:

```bash
# All container logs
docker-compose logs

# Follow log output
docker-compose logs -f

# Specific service logs
docker-compose logs zodiac-dev
```

## Advanced Usage

### Custom Build Arguments

Pass build arguments for different environments:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://custom.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=your_key \
  -t zodiac:custom \
  --target production .
```

### Docker Commands Reference

```bash
# List running containers
docker ps

# Stop all containers
docker-compose down

# Remove volumes (clean slate)
docker-compose down -v

# View container resource usage
docker stats

# Execute commands in running container
docker exec -it zodiac-dev sh

# View image sizes
docker images | grep zodiac
```

## Security Considerations

- The production image runs nginx as a non-root user
- Environment variables are only used during build time for production
- Sensitive data should never be committed to the repository
- Use secrets management for production deployments