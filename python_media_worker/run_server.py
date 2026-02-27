
import sys
import asyncio
import uvicorn
import os

if __name__ == "__main__":
    # Remove reload=True to run in the same process (simplifies debugging loop issues)
    # If reload is needed, we must ensure the policy is set in the spawned child.
    # For now, let's use no reload to force the policy to stick.
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    uvicorn.run(
        "main_media_server:app", 
        host="127.0.0.1", 
        port=8000, 
        reload=False, 
        loop="asyncio"
    )
