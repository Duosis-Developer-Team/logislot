"""tenant-plane baseline

Bu revizyon BILEREK bostur. Yeni bir tenant semasi, o anki model
durumundan `create_all` ile olusturulur ve dogrudan bu zincirin head'ine
`stamp` edilir; migrationlarin bastan oynatilmasi GEREKMEZ.

Baseline'in varlik sebebi, bundan SONRAKI tenant-plane sema
degisikliklerinin (kolon ekleme vb.) uzerine yazilabilecegi bir zemin
saglamaktir. Control-plane degisiklikleri ayri zincire (alembic/) gider.

Revision ID: 0001_tenant_baseline
"""

revision = "0001_tenant_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
