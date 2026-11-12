"""Endpoint tanpa login: pengecekan keaslian pernyataan oleh pihak luar (importir, verifikator)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import statement as stmt

router = APIRouter(prefix="/api/public", tags=["publik"])


@router.get("/statements/{code}")
def verify_statement(code: str, db: Session = Depends(get_db)):
    if not stmt.normalise_code(code):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Format kode verifikasi tidak dikenal")
    data = stmt.verify(db, code)
    if not data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kode verifikasi tidak terdaftar")
    return data
