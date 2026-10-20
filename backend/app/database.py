from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

settings = get_settings()

_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,   # cegah error "MySQL server has gone away"
    pool_recycle=3600,
    connect_args=_connect_args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_columns() -> list[str]:
    """Migrasi ringan: tambahkan kolom baru ke tabel lama (tanpa menghapus data).

    Dipanggil saat aplikasi mulai, sehingga database dari versi sebelumnya tetap bisa dipakai.
    """
    from sqlalchemy import inspect, text

    added = []
    insp = inspect(engine)
    for table in Base.metadata.sorted_tables:
        if not insp.has_table(table.name):
            continue
        existing = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing:
                continue
            ddl_type = col.type.compile(dialect=engine.dialect)
            default = ""
            if col.name == "item":
                default = " DEFAULT 0"
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {col.name} {ddl_type} NULL{default}"))
            added.append(f"{table.name}.{col.name}")
    return added
