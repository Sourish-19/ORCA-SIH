"""
ORCA Multi-Turn Session Memory Manager
Maintains conversational context across turns: last queried location, last recommendation,
last safety verdict, weather observations, and conversational history.
"""

from dataclasses import dataclass, field
import time
from typing import Any, Dict, List, Optional


@dataclass
class ConversationTurn:
    query: str
    intent: str
    location: str
    target_date: str
    headline: str
    narrative: str
    answer: str
    top_zone: Optional[str] = None
    safety_status: str = "GO"
    requested_information: List[str] = field(default_factory=list)
    unavailable_parameter: Optional[str] = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class SessionState:
    session_id: str
    active_location: str = "Chennai"
    active_landing_centre: str = "Royapuram Fishing Harbour (Kasimedu)"
    last_recommended_zone: Optional[str] = "Chennai Offshore East"
    last_suitability_score: Optional[float] = 88.0
    last_safety_status: str = "GO"
    last_weather: Dict[str, Any] = field(default_factory=dict)
    turns: List[ConversationTurn] = field(default_factory=list)
    last_context_dict: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def add_turn(self, turn: ConversationTurn) -> None:
        self.turns.append(turn)
        # Keep last 10 turns
        if len(self.turns) > 10:
            self.turns.pop(0)
        self.updated_at = time.time()
        if turn.location and turn.location != "Unknown":
            self.active_location = turn.location
        if turn.top_zone:
            self.last_recommended_zone = turn.top_zone
        if turn.safety_status:
            self.last_safety_status = turn.safety_status


_GLOBAL_SESSIONS: Dict[str, SessionState] = {}


def get_or_create_session(session_id: Optional[str] = None) -> SessionState:
    sid = (session_id or "default_session").strip()
    if sid not in _GLOBAL_SESSIONS:
        _GLOBAL_SESSIONS[sid] = SessionState(session_id=sid)
    return _GLOBAL_SESSIONS[sid]


def update_session(
    session_id: Optional[str],
    query: str,
    intent: str,
    location: str,
    target_date: str,
    headline: str,
    narrative: str,
    answer: str,
    top_zone: Optional[str] = None,
    safety_status: str = "GO",
    weather: Optional[Dict[str, Any]] = None,
    context_dict: Optional[Dict[str, Any]] = None,
    requested_information: Optional[List[str]] = None,
    unavailable_parameter: Optional[str] = None,
) -> SessionState:
    sess = get_or_create_session(session_id)
    turn = ConversationTurn(
        query=query,
        intent=intent,
        location=location,
        target_date=target_date,
        headline=headline,
        narrative=narrative,
        answer=answer,
        top_zone=top_zone,
        safety_status=safety_status,
        requested_information=requested_information or [],
        unavailable_parameter=unavailable_parameter,
    )
    sess.add_turn(turn)
    if weather:
        sess.last_weather = weather
    if context_dict:
        sess.last_context_dict = context_dict
    return sess


def clear_sessions() -> None:
    _GLOBAL_SESSIONS.clear()

