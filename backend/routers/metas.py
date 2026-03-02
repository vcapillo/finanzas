"""
FinanzasVH — F-04: Módulo de Metas Financieras
Router FastAPI con CRUD completo + registro de abonos.
"""
from datetime import datetime, date as date_type
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import models
from database import get_db

router = APIRouter(prefix="/v3/metas", tags=["F04-Metas"])


# ═══════════════════════════════════════════════════════════════
# SCHEMAS Pydantic
# ═══════════════════════════════════════════════════════════════

class GoalIn(BaseModel):
    name:           str
    description:    Optional[str]   = None
    target_amount:  float
    current_amount: Optional[float] = 0.0
    deadline:       Optional[str]   = None   # YYYY-MM-DD
    account:        Optional[str]   = None
    currency:       Optional[str]   = "PEN"
    icon:           Optional[str]   = "🎯"
    color:          Optional[str]   = "#22c55e"
    is_active:      Optional[bool]  = True

class GoalOut(GoalIn):
    id:          int
    is_achieved: bool
    created_at:  Optional[datetime] = None
    updated_at:  Optional[datetime] = None

    class Config:
        from_attributes = True

class ContributionIn(BaseModel):
    amount: float
    date:   str                          # YYYY-MM-DD
    note:   Optional[str] = None

class ContributionOut(ContributionIn):
    id:         int
    goal_id:    int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

def _months_until(deadline_str: str) -> Optional[float]:
    """Calcula los meses restantes desde hoy hasta la fecha límite."""
    if not deadline_str:
        return None
    try:
        dl = datetime.strptime(deadline_str, "%Y-%m-%d").date()
        today = date_type.today()
        if dl <= today:
            return 0.0
        months = (dl.year - today.year) * 12 + (dl.month - today.month)
        # Ajuste por días dentro del mes
        if dl.day >= today.day:
            months += (dl.day - today.day) / 30
        else:
            months -= (today.day - dl.day) / 30
        return round(max(months, 0), 1)
    except ValueError:
        return None


def _build_summary(goal: models.FinancialGoal) -> dict:
    """Construye el dict de respuesta enriquecido con métricas calculadas."""
    remaining = goal.target_amount - goal.current_amount
    pct = min((goal.current_amount / goal.target_amount * 100), 100) if goal.target_amount > 0 else 0
    months_left = _months_until(goal.deadline)

    monthly_needed = None
    if months_left and months_left > 0 and remaining > 0:
        monthly_needed = round(remaining / months_left, 2)

    return {
        "id":              goal.id,
        "name":            goal.name,
        "description":     goal.description,
        "target_amount":   goal.target_amount,
        "current_amount":  goal.current_amount,
        "remaining":       round(remaining, 2),
        "pct_progress":    round(pct, 1),
        "deadline":        goal.deadline,
        "account":         goal.account,
        "currency":        goal.currency,
        "icon":            goal.icon,
        "color":           goal.color,
        "is_active":       goal.is_active,
        "is_achieved":     goal.is_achieved,
        "months_left":     months_left,
        "monthly_needed":  monthly_needed,
        "created_at":      goal.created_at.isoformat() if goal.created_at else None,
        "updated_at":      goal.updated_at.isoformat() if goal.updated_at else None,
        "abonos":          [
            {
                "id":         a.id,
                "amount":     a.amount,
                "date":       a.date,
                "note":       a.note,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in sorted(goal.abonos, key=lambda x: x.date, reverse=True)
        ],
    }


# ═══════════════════════════════════════════════════════════════
# ENDPOINTS — Metas
# ═══════════════════════════════════════════════════════════════

@router.get("/")
def list_goals(
    include_achieved: bool = False,
    db: Session = Depends(get_db)
):
    """Lista todas las metas activas con métricas calculadas."""
    q = db.query(models.FinancialGoal)
    if not include_achieved:
        q = q.filter(models.FinancialGoal.is_active == True)
    goals = q.order_by(models.FinancialGoal.created_at.asc()).all()
    return [_build_summary(g) for g in goals]


@router.post("/", status_code=201)
def create_goal(data: GoalIn, db: Session = Depends(get_db)):
    """Crea una nueva meta financiera."""
    goal = models.FinancialGoal(**data.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _build_summary(goal)


@router.get("/{goal_id}")
def get_goal(goal_id: int, db: Session = Depends(get_db)):
    """Obtiene una meta por ID con todo el historial de abonos."""
    goal = db.query(models.FinancialGoal).filter(models.FinancialGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Meta no encontrada")
    return _build_summary(goal)


@router.put("/{goal_id}")
def update_goal(goal_id: int, data: GoalIn, db: Session = Depends(get_db)):
    """Actualiza los datos de una meta."""
    goal = db.query(models.FinancialGoal).filter(models.FinancialGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Meta no encontrada")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    goal.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(goal)
    return _build_summary(goal)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    """Elimina una meta y sus abonos (cascade)."""
    goal = db.query(models.FinancialGoal).filter(models.FinancialGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Meta no encontrada")
    db.delete(goal)
    db.commit()


@router.patch("/{goal_id}/archivar")
def toggle_active(goal_id: int, db: Session = Depends(get_db)):
    """Activa o archiva una meta sin eliminarla."""
    goal = db.query(models.FinancialGoal).filter(models.FinancialGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Meta no encontrada")
    goal.is_active = not goal.is_active
    goal.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(goal)
    return {"id": goal.id, "is_active": goal.is_active}


# ═══════════════════════════════════════════════════════════════
# ENDPOINTS — Abonos (contribuciones a una meta)
# ═══════════════════════════════════════════════════════════════

@router.post("/{goal_id}/abonos", status_code=201)
def add_contribution(goal_id: int, data: ContributionIn, db: Session = Depends(get_db)):
    """
    Registra un abono a una meta y actualiza current_amount.
    Si current_amount >= target_amount, marca la meta como lograda.
    """
    goal = db.query(models.FinancialGoal).filter(models.FinancialGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Meta no encontrada")

    # Crear abono
    contribution = models.GoalContribution(
        goal_id=goal_id,
        amount=data.amount,
        date=data.date,
        note=data.note,
    )
    db.add(contribution)

    # Actualizar progreso
    goal.current_amount = round(goal.current_amount + data.amount, 2)
    goal.updated_at = datetime.utcnow()

    # Auto-marcar como lograda si se alcanzó o superó la meta
    if goal.current_amount >= goal.target_amount:
        goal.is_achieved = True

    db.commit()
    db.refresh(goal)
    return _build_summary(goal)


@router.delete("/{goal_id}/abonos/{contribution_id}", status_code=200)
def delete_contribution(goal_id: int, contribution_id: int, db: Session = Depends(get_db)):
    """Elimina un abono y ajusta el current_amount de la meta."""
    contribution = db.query(models.GoalContribution).filter(
        models.GoalContribution.id == contribution_id,
        models.GoalContribution.goal_id == goal_id
    ).first()
    if not contribution:
        raise HTTPException(status_code=404, detail="Abono no encontrado")

    goal = db.query(models.FinancialGoal).filter(models.FinancialGoal.id == goal_id).first()
    goal.current_amount = round(max(0, goal.current_amount - contribution.amount), 2)
    goal.updated_at = datetime.utcnow()

    # Revertir estado de logrado si ya no se cumple la meta
    if goal.current_amount < goal.target_amount:
        goal.is_achieved = False

    db.delete(contribution)
    db.commit()
    db.refresh(goal)
    return _build_summary(goal)
