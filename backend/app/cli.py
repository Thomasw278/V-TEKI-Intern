"""Alat pengelola sistem untuk akun superadmin & admin peninjau (dijalankan di server, bukan dari aplikasi web).

Superadmin HANYA bisa dibuat dari sini; tidak ada API atau halaman pendaftaran untuk peran tersebut.

Contoh:
    python -m app.cli init-db
    python -m app.cli create-superadmin --email pengelola@karbonlens.id --name "Dewi Pengelola"
    python -m app.cli list-superadmins
    python -m app.cli create-admin --email reviewer@karbonlens.id --name "Rina Peninjau"
    python -m app.cli list-companies
    python -m app.cli assign --admin reviewer@karbonlens.id --company 3
    python -m app.cli assign --admin reviewer@karbonlens.id --company akun@perusahaan.co.id
    python -m app.cli unassign --admin reviewer@karbonlens.id --company 3
    python -m app.cli list-admins
    python -m app.cli set-password --email reviewer@karbonlens.id
    python -m app.cli deactivate --email reviewer@karbonlens.id
"""
from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import select

from . import models  # noqa: F401  (registrasi tabel)
from .database import Base, SessionLocal, engine, ensure_columns, migrate_legacy
from .models import AdminCompany, Company, User
from .security import hash_password
from .services.requirements import migrate_requirements
from .services.setup import seed_document_types


def _fail(msg: str) -> None:
    print(f"Gagal: {msg}", file=sys.stderr)
    sys.exit(1)


def _ask_password(given: str | None) -> str:
    if given:
        pw = given
    else:
        pw = getpass.getpass("Kata sandi (min. 8 karakter): ")
        if getpass.getpass("Ulangi kata sandi: ") != pw:
            _fail("kata sandi tidak sama")
    if len(pw) < 8:
        _fail("kata sandi minimal 8 karakter")
    return pw


def _admin(db, email: str) -> User:
    u = db.scalar(select(User).where(User.email == email.lower()))
    if not u:
        _fail(f"akun {email} tidak ditemukan")
    if u.role != "admin":
        _fail(f"{email} adalah akun perusahaan, bukan admin")
    return u


def _company(db, ref: str) -> Company:
    if ref.isdigit():
        c = db.get(Company, int(ref))
    else:
        owner = db.scalar(select(User).where(User.email == ref.lower(), User.role == "company"))
        c = db.get(Company, owner.company_id) if owner else None
    if not c:
        _fail(f"perusahaan '{ref}' tidak ditemukan (pakai ID dari list-companies atau email akun perusahaan)")
    return c


def init_db(_args) -> None:
    Base.metadata.create_all(bind=engine)
    ensure_columns()
    migrate_legacy()
    with SessionLocal() as db:
        seed_document_types(db)
        for msg in migrate_requirements(db):
            print(msg)
    print("Tabel dan katalog dokumen siap.")


def _create_user(args, role: str) -> User:
    Base.metadata.create_all(bind=engine)
    ensure_columns()
    migrate_legacy()
    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.email == args.email.lower())):
            _fail(f"email {args.email} sudah dipakai")
        u = User(company_id=None, name=args.name, email=args.email.lower(), role=role,
                 password_hash=hash_password(_ask_password(args.password)))
        db.add(u)
        db.commit()
        return u


def create_admin(args) -> None:
    u = _create_user(args, "admin")
    print(f"Admin dibuat: {u.name} <{u.email}> (id {u.id}). Tugaskan ke perusahaan dengan perintah assign.")


def create_superadmin(args) -> None:
    u = _create_user(args, "superadmin")
    print(f"Superadmin dibuat: {u.name} <{u.email}> (id {u.id}). Masuk lewat halaman login yang sama.")


def list_superadmins(_args) -> None:
    with SessionLocal() as db:
        rows = db.scalars(select(User).where(User.role == "superadmin").order_by(User.id)).all()
        if not rows:
            print("Belum ada superadmin. Buat dengan: python -m app.cli create-superadmin --email ... --name ...")
        for u in rows:
            state = "" if u.is_active else "  [nonaktif]"
            last = u.last_login_at.strftime("%Y-%m-%d %H:%M") if u.last_login_at else "-"
            print(f"{u.id:>4}  {u.name} <{u.email}>{state}  ·  login terakhir: {last}")


def assign(args) -> None:
    with SessionLocal() as db:
        a, c = _admin(db, args.admin), _company(db, args.company)
        if db.get(AdminCompany, (a.id, c.id)):
            print(f"{a.email} sudah meninjau {c.name}.")
            return
        db.add(AdminCompany(admin_id=a.id, company_id=c.id))
        db.commit()
        print(f"{a.email} sekarang meninjau {c.name} (id {c.id}).")


def unassign(args) -> None:
    with SessionLocal() as db:
        a, c = _admin(db, args.admin), _company(db, args.company)
        row = db.get(AdminCompany, (a.id, c.id))
        if not row:
            print("Penugasan tidak ada.")
            return
        db.delete(row)
        db.commit()
        print(f"{a.email} tidak lagi meninjau {c.name}.")


def list_companies(_args) -> None:
    with SessionLocal() as db:
        rows = db.execute(select(Company.id, Company.name, Company.city, User.email)
                          .join(User, (User.company_id == Company.id) & (User.role == "company"), isouter=True)
                          .order_by(Company.id)).all()
        if not rows:
            print("Belum ada perusahaan terdaftar.")
        for cid, name, city, email in rows:
            print(f"{cid:>4}  {name}  ·  {city or '-'}  ·  akun: {email or '-'}")


def list_admins(_args) -> None:
    with SessionLocal() as db:
        admins = db.scalars(select(User).where(User.role == "admin").order_by(User.id)).all()
        if not admins:
            print("Belum ada admin. Buat dengan: python -m app.cli create-admin --email ... --name ...")
        for a in admins:
            names = db.scalars(select(Company.name).join(AdminCompany, AdminCompany.company_id == Company.id)
                               .where(AdminCompany.admin_id == a.id).order_by(Company.name)).all()
            state = "" if a.is_active else "  [nonaktif]"
            print(f"{a.id:>4}  {a.name} <{a.email}>{state}")
            print("        meninjau: " + (", ".join(names) if names else "(belum ada perusahaan)"))


def set_password(args) -> None:
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == args.email.lower()))
        if not u:
            _fail(f"akun {args.email} tidak ditemukan")
        u.password_hash = hash_password(_ask_password(args.password))
        db.commit()
        print(f"Kata sandi {u.email} diganti.")


def set_active(args, active: bool) -> None:
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == args.email.lower()))
        if not u:
            _fail(f"akun {args.email} tidak ditemukan")
        u.is_active = active
        db.commit()
        print(f"{u.email} {'diaktifkan' if active else 'dinonaktifkan'}.")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="python -m app.cli", description="Pengelolaan superadmin & admin peninjau KarbonLens.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init-db", help="buat tabel & katalog dokumen").set_defaults(fn=init_db)
    for name, fn, what in (("create-admin", create_admin, "admin peninjau"),
                           ("create-superadmin", create_superadmin, "superadmin (pengelola sistem)")):
        p = sub.add_parser(name, help=f"buat akun {what}")
        p.add_argument("--email", required=True)
        p.add_argument("--name", required=True)
        p.add_argument("--password", help="kosongkan untuk diketik tersembunyi")
        p.set_defaults(fn=fn)
    sub.add_parser("list-superadmins", help="daftar akun superadmin").set_defaults(fn=list_superadmins)
    for name, fn in (("assign", assign), ("unassign", unassign)):
        p = sub.add_parser(name, help=f"{'tugaskan' if name == 'assign' else 'cabut'} admin ke/dari perusahaan")
        p.add_argument("--admin", required=True, help="email admin")
        p.add_argument("--company", required=True, help="ID perusahaan atau email akun perusahaan")
        p.set_defaults(fn=fn)
    sub.add_parser("list-companies", help="daftar perusahaan terdaftar").set_defaults(fn=list_companies)
    sub.add_parser("list-admins", help="daftar admin & perusahaan yang ditinjau").set_defaults(fn=list_admins)
    p = sub.add_parser("set-password", help="atur ulang kata sandi akun (admin atau perusahaan)")
    p.add_argument("--email", required=True)
    p.add_argument("--password")
    p.set_defaults(fn=set_password)
    for name, active in (("activate", True), ("deactivate", False)):
        p = sub.add_parser(name, help=f"{'aktifkan' if active else 'nonaktifkan'} akun")
        p.add_argument("--email", required=True)
        p.set_defaults(fn=lambda a, _v=active: set_active(a, _v))
    args = ap.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
