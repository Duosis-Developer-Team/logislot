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


# ---------------------------------------------------- portal-aware login


async def test_portal_param_matching_accepted(client, seeded):
    """Portal parametresi endpoint ile uyumluysa login normal calisir."""
    cases = [
        ("/auth/supplier-login", "tedarikci@anadoluun.com", "supplier"),
        ("/auth/login", "admin@cakesbakes.com", "admin"),
        ("/auth/platform-login", "admin@logislot.com", "platform"),
    ]
    for endpoint, email, portal in cases:
        response = await client.post(
            endpoint, json={"email": email, "password": "Demo123!", "portal": portal}
        )
        assert response.status_code == 200, (endpoint, portal)
        assert response.json()["data"]["access_token"]


async def test_portal_param_mismatch_rejected(client, seeded):
    """Portal parametresi endpoint'ten farkliysa dogru kimlikle bile 401."""
    cases = [
        # endpoint, email (o endpoint icin GECERLI hesap), yanlis portal
        ("/auth/supplier-login", "tedarikci@anadoluun.com", "admin"),
        ("/auth/login", "admin@cakesbakes.com", "platform"),
        ("/auth/platform-login", "admin@logislot.com", "supplier"),
    ]
    for endpoint, email, portal in cases:
        response = await client.post(
            endpoint, json={"email": email, "password": "Demo123!", "portal": portal}
        )
        assert response.status_code == 401, (endpoint, portal)


async def test_portal_param_backward_compatible(client, seeded):
    """Eski payload (portal'siz) kirilmaz."""
    response = await client.post(
        "/auth/login", json={"email": "admin@cakesbakes.com", "password": "Demo123!"}
    )
    assert response.status_code == 200


async def test_wrong_portal_verified_identity_gets_clear_error(client, seeded):
    """DOGRU parola + yanlis portal endpointi = yonlendiren net hata.

    Admin hesabi supplier portalindan girmeye calisirsa (parola dogru),
    genel 'e-posta veya parola hatali' yerine portal mesaji doner.
    """
    response = await client.post(
        "/auth/supplier-login",
        json={"email": "admin@cakesbakes.com", "password": "Demo123!"},
    )
    assert response.status_code == 401
    assert "Tedarikci Portali icin yetkili degil" in response.json()["error"]["message"]

    # Supplier hesabi admin portalindan
    response = await client.post(
        "/auth/login",
        json={"email": "tedarikci@anadoluun.com", "password": "Demo123!"},
    )
    assert response.status_code == 401
    assert "Yonetim Paneli icin yetkili degil" in response.json()["error"]["message"]

    # Tenant hesabi platform portalindan
    response = await client.post(
        "/auth/platform-login",
        json={"email": "admin@cakesbakes.com", "password": "Demo123!"},
    )
    assert response.status_code == 401
    assert "Platform Yonetimi icin yetkili degil" in response.json()["error"]["message"]


async def test_wrong_portal_wrong_password_stays_generic(client, seeded):
    """Yanlis parola ile cross-portal denemesi hesap varligini SIZDIRMAZ."""
    response = await client.post(
        "/auth/supplier-login",
        json={"email": "admin@cakesbakes.com", "password": "yanlis-parola"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "E-posta veya parola hatali"


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
