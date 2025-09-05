# AutoPromote Documentation

## Overview
AutoPromote is an automated content promotion system with a Node.js/Express backend and Firebase integration for authentication and database services.

## Features
- Automated content promotion based on performance metrics
- A/B testing capabilities
- Analytics tracking and reporting
- Admin dashboard for content management
- User authentication via Firebase

## API Endpoints

### Health Check
- `GET /api/health` - Check if the API is running

### Content Endpoints
- `GET /api/content` - List all content
- `POST /api/content` - Create new content
- `GET /api/content/:id` - Get specific content
- `PUT /api/content/:id` - Update content
- `DELETE /api/content/:id` - Delete content

### Analytics Endpoints
- `GET /api/analytics` - Get analytics data
- `POST /api/analytics/track` - Track a new analytics event

### Admin Endpoints
- `GET /api/admin/dashboard` - Get admin dashboard data
- `POST /api/admin/promote` - Manually promote content

## Authentication
The API uses Firebase Authentication. All requests except for the health check require a valid authentication token.

## Deployment
The application is deployed on Render with continuous deployment from the GitHub repository.
