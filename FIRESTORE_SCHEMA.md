# Firebase/Firestore Data Schema

## Collections

### users
```typescript
interface User {
  id: string;            // Firebase Auth UID
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;     // ISO date string
}
```

### content
```typescript
interface Content {
  id: string;            // Auto-generated
  userId: string;        // Reference to users collection
  title: string;
  type: 'article' | 'image' | 'video';
  url: string;
  description?: string;
  createdAt: string;     // ISO date string
}
```

### analytics
```typescript
interface Analytics {
  id: string;            // Auto-generated
  userId: string;        // Reference to users collection
  contentId: string;     // Reference to content collection
  views: number;
  clicks: number;
  createdAt: string;     // ISO date string
}
```

### promotions
```typescript
interface Promotion {
  id: string;            // Auto-generated
  contentId: string;     // Reference to content collection
  userId: string;        // Reference to users collection
  status: 'scheduled' | 'active' | 'completed' | 'failed';
  platform: 'twitter' | 'facebook' | 'instagram';
  scheduledFor: string;  // ISO date string
  completedAt?: string;  // ISO date string
  result?: {
    success: boolean;
    message?: string;
    postId?: string;
  };
  createdAt: string;     // ISO date string
}
```

## Security Rules

```typescript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User can read their own document and admins can read all
    match /users/{userId} {
      allow read: if request.auth.uid == userId || 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      allow write: if false;  // Only allow writes through admin SDK
    }
    
    // Users can read/write their own content, admins can read all
    match /content/{contentId} {
      allow read: if resource.data.userId == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      allow write: if request.auth.uid == request.resource.data.userId;
    }
    
    // Users can read their own analytics, admins can read all
    match /analytics/{analyticsId} {
      allow read: if resource.data.userId == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      allow write: if false;  // Only allow writes through admin SDK
    }
    
    // Users can read their own promotions, admins can read all
    match /promotions/{promotionId} {
      allow read: if resource.data.userId == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      allow create: if request.auth.uid == request.resource.data.userId;
      allow update: if false;  // Only allow updates through admin SDK
    }
  }
}
