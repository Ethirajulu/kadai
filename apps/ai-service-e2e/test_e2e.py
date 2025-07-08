import httpx
import pytest

@pytest.mark.asyncio
async def test_root_endpoint():
    async with httpx.AsyncClient() as client:
        response = await client.get("http://localhost:8000/")
        assert response.status_code == 200
        assert response.json() == {"message": "AI Service is running"} 