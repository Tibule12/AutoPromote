# Updated Firestore Schema for Admin Dashboard

## Collections

### users
```typescript
interface User {
  id: string;                     // Firebase Auth UID
  name: string;                   // User's display name
  email: string;                  // User's email address
  role: 'user' | 'admin';         // User role for access control
  createdAt: Timestamp;           // When the user was created
  lastLogin?: Timestamp;          // Last login timestamp
  profileUrl?: string;            // Profile image URL
  status: 'active' | 'inactive';  // Account status
  preferences?: {                 // User preferences
    notifications: boolean;
    theme: 'light' | 'dark';
  };
}
```

### content
```typescript
interface Content {
  id: string;                                      // Auto-generated
  userId: string;                                  // Reference to users collection
  title: string;                                   // Content title
  type: 'article' | 'image' | 'video' | 'audio';   // Content type
  url: string;                                     // Content URL
  description?: string;                            // Content description
  createdAt: Timestamp;                            // When content was created
  updatedAt?: Timestamp;                           // When content was last updated
  status: 'active' | 'pending' | 'archived';       // Content status
  views: number;                                   // View count
  engagementRate: number;                          // Engagement rate (0-1)
  tags?: string[];                                 // Content tags
  category?: string;                               // Content category
  metadata?: {                                     // Type-specific metadata
    duration?: number;                             // For video/audio (seconds)
    dimensions?: { width: number, height: number}; // For images/videos
    fileSize?: number;                             // Size in bytes
  };
}
```

### promotions
```typescript
interface Promotion {
  id: string;                                           // Auto-generated
  contentId: string;                                    // Reference to content collection
  userId: string;                                       // Reference to users collection
  status: 'scheduled' | 'active' | 'completed' | 'failed'; // Promotion status
  platform: 'twitter' | 'facebook' | 'instagram' | 'linkedin' | 'tiktok'; // Platform
  startDate: Timestamp;                                 // When promotion starts
  endDate: Timestamp;                                   // When promotion ends
  budget: number;                                       // Promotion budget
  results?: {                                           // Promotion results
    impressions: number;                                // Impression count
    clicks: number;                                     // Click count
    conversions: number;                                // Conversion count
    costPerClick?: number;                              // CPC
    costPerConversion?: number;                         // CPA
  };
  settings?: {                                          // Promotion settings
    targetAudience?: {                                  // Target audience
      ageRange?: { min: number, max: number };
      locations?: string[];
      interests?: string[];
      gender?: 'male' | 'female' | 'all';
    };
    schedule?: {                                        // Posting schedule
      frequency: 'once' | 'daily' | 'weekly';
      bestTimeOfDay?: boolean;                          // Use AI to determine best time
    };
  };
  createdAt: Timestamp;                                 // When promotion was created
  updatedAt?: Timestamp;                                // When promotion was last updated
}
```

### activities
```typescript
interface Activity {
  id: string;                     // Auto-generated
  type: 'user' | 'content' | 'promotion' | 'system'; // Activity type
  title: string;                  // Activity title
  description: string;            // Activity description
  timestamp: Timestamp;           // When activity occurred
  userId?: string;                // Associated user (if applicable)
  contentId?: string;             // Associated content (if applicable)
  promotionId?: string;           // Associated promotion (if applicable)
  metadata?: any;                 // Additional activity data
}
```

### analytics
```typescript
interface Analytics {
  id: string;                     // Auto-generated
  userId: string;                 // Reference to users collection
  contentId?: string;             // Reference to content collection (optional)
  promotionId?: string;           // Reference to promotions collection (optional)
  views: number;                  // View count
  clicks: number;                 // Click count
  shares: number;                 // Share count
  comments: number;               // Comment count
  revenue: number;                // Revenue generated
  date: Timestamp;                // Date of analytics
  source?: string;                // Traffic source
  device?: string;                // Device type
  location?: string;              // User location
  sessionDuration?: number;       // Session duration in seconds
}
```

## Relationships

- **User to Content**: One-to-many. A user can have multiple content items.
- **User to Promotions**: One-to-many. A user can have multiple promotions.
- **Content to Promotions**: One-to-many. A content item can have multiple promotions.
- **User/Content/Promotions to Activities**: One-to-many. Each entity can have multiple associated activities.
- **User/Content/Promotions to Analytics**: One-to-many. Each entity can have multiple analytics records.

## Security Rules

```typescript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Function to check if user is admin
    function isAdmin() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Function to check if document belongs to the requesting user
    function isOwner(userId) {
      return request.auth.uid == userId;
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow create: if request.auth != null;
      allow update: if isOwner(userId) || isAdmin();
      allow delete: if isAdmin();
    }
    
    // Content collection
    match /content/{contentId} {
      allow read: if isOwner(resource.data.userId) || isAdmin() || 
                    resource.data.status == 'active';
      allow create: if isOwner(request.resource.data.userId);
      allow update: if isOwner(resource.data.userId) || isAdmin();
      allow delete: if isOwner(resource.data.userId) || isAdmin();
    }
    
    // Promotions collection
    match /promotions/{promotionId} {
      allow read: if isOwner(resource.data.userId) || isAdmin();
      allow create: if isOwner(request.resource.data.userId);
      allow update: if isOwner(resource.data.userId) || isAdmin();
      allow delete: if isAdmin();
    }
    
    // Activities collection
    match /activities/{activityId} {
      allow read: if resource.data.userId == null || 
                    isOwner(resource.data.userId) || 
                    isAdmin();
      allow write: if isAdmin();
    }
    
    // Analytics collection
    match /analytics/{analyticsId} {
      allow read: if isOwner(resource.data.userId) || isAdmin();
      allow write: if isAdmin();
    }
  }
}
```

## Admin Dashboard Data Requirements

For the admin dashboard to function properly, the following data patterns must be maintained:

1. **User Data**:
   - Ensure user documents include all required fields, especially `role` for admin access control
   - Maintain accurate `createdAt` timestamps for user registration analytics

2. **Content Data**:
   - Include `views` and `engagementRate` fields for performance metrics
   - Maintain proper content `status` values for filtering active content
   - Ensure proper tagging with `type` field for content type distribution analytics

3. **Promotion Data**:
   - Include both `startDate` and `endDate` as Firestore Timestamps
   - Maintain accurate `status` values that reflect the current state
   - Include detailed `results` object for completed promotions

4. **Activities Data**:
   - Log important system events to display in the activity feed
   - Include descriptive `title` and `description` fields
   - Maintain proper references to associated entities (users, content, promotions)

5. **Analytics Data**:
   - Store daily analytics records rather than updating a single document
   - Include revenue metrics for financial reporting
   - Track engagement metrics (views, clicks, shares, comments)
