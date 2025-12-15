# AutoPromote Development Environment Setup

## Prerequisites

Before you can run the AutoPromote application, you need to install Node.js and npm on your system.

## Installing Node.js and npm

1. Visit the official Node.js website: https://nodejs.org/
2. Download the LTS (Long Term Support) version for your operating system (Windows, macOS, or Linux)
3. Run the installer and follow the installation wizard steps
4. After installation, verify that Node.js and npm are installed by opening a new terminal/command prompt and running:
   ```
   node --version
   npm --version
   ```

## Setting up the AutoPromote Project

After installing Node.js and npm, follow these steps to set up the project:

### Server Setup (Back-end)

1. Navigate to the server directory:
   ```
   cd server
   ```
2. Install server dependencies:
   ```
   npm install
   ```
3. Start the server in development mode:
   ```
   npm run dev
   ```
   The server will start on port 5000 by default.

### Client Setup (Front-end)

1. Navigate to the client directory:
   ```
   cd client
   ```
2. Install client dependencies:
   ```
   npm install
   ```
3. Start the React development server:
   ```
   npm start
   ```
   The client will start on port 3000 by default.

## Running Both Servers Concurrently

To run both the client and server simultaneously, you can:

1. Open two separate terminal windows/command prompts
2. In the first terminal, start the server:
   ```
   cd server
   npm run dev
   ```
3. In the second terminal, start the client:
   ```
   cd client
   npm start
   ```

Alternatively, you can install a package like `concurrently` to run both servers from a single command:

```
npm install -g concurrently
```

Then, from the root directory, you can create a script to start both servers.
