from tests.conftest import auth_headers, login


async def test_tenant_login_and_me(client, seeded):
    token = await login(client, "/auth/login", "admin@cakesbakes.com")
    response = await client.get("/auth/me", headers=auth_headers(token))
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["user_type"] == "tenant"
    assert data["tenant_id"] == str(seeded["tenant"].id)
    assert "appt.approve" in data["permissions"]
    assert len(data["facilities"]) == 1


async def test_wrong_password_rejected(client, seeded):
    response = await client.post(
        "/auth/login", json={"email": "admin@cakesbakes.com", "password": "yanlis"}
    )
    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "UNAUTHORIZED"


async def test_supplier_login_and_me(client, seeded):
    token = await login(client, "/auth/supplier-login", "tedarikci@anadoluun.com")
    response = await client.get("/auth/me", headers=auth_headers(token))
    data = response.json()["data"]
    assert data["user_type"] == "supplier"
    assert data["supplier_id"] == str(seeded["suppliers"]["un"].id)


async def test_platform_login_and_me(client, seeded):
    token = await login(client, "/auth/platform-login", "admin@logislot.com")
    response = await client.get("/auth/me", headers=auth_headers(token))
    data = response.json()["data"]
    assert data["user_type"] == "platform"
    assert "platform.tenant.view" in data["permissions"]
    # Platform izin uzayi tenant izinleri icermez
    assert not any(p.startswith("appt.") for p in data["permissions"])


async def test_user_types_cannot_cross_login(client, seeded):
    # Tenant hesabi supplier login'inden giremez
    response = await client.post(
        "/auth/supplier-login",
        json={"email": "admin@cakesbakes.com", "password": "Demo123!"},
    )
    assert response.status_code == 401


async def test_refresh_flow(client, seeded):
    response = await client.post(
        "/auth/login", json={"email": "admin@cakesbakes.com", "password": "Demo123!"}
    )
    refresh_token = response.json()["data"]["refresh_token"]
    response = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    assert response.json()["data"]["access_token"]
    # Access token, refresh yerine kullanilamaz
    access = response.json()["data"]["access_token"]
    response = await client.post("/auth/refresh", json={"refresh_token": access})
    assert response.status_code == 401
