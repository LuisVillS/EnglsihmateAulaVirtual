import requests
from services.config import (
    SUPABASE_SCHEMA,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
)


def using_supabase():
    return True


def _supabase_headers(prefer=None):
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY or "",
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY or ''}",
        "Accept-Profile": SUPABASE_SCHEMA,
        "Content-Profile": SUPABASE_SCHEMA,
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _supabase_request(method, path, params=None, json=None, prefer=None):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("Supabase no esta configurado. Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.")
        return None

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{path.lstrip('/')}"
    try:
        response = requests.request(
            method,
            url,
            headers=_supabase_headers(prefer=prefer),
            params=params,
            json=json,
            timeout=20,
        )
        response.raise_for_status()
        if not response.text:
            return None
        return response.json()
    except requests.RequestException as exc:
        details = ""
        if getattr(exc, "response", None) is not None:
            details = f" | {exc.response.text}"
        print(f"Error conectando a Supabase: {exc}{details}")
        return None


def _supabase_filter_value(operator, value):
    if value is None:
        return f"{operator}.null"
    return f"{operator}.{value}"


def select_rows(table, columns="*", filters=None, order=None, limit=None):
    params = {"select": columns}
    if filters:
        for column, operator, value in filters:
            params[column] = _supabase_filter_value(operator, value)
    if order:
        params["order"] = order
    if limit is not None:
        params["limit"] = str(limit)
    return _supabase_request("GET", table, params=params) or []


def update_rows(table, values, filters, returning="representation"):
    params = {}
    for column, operator, value in filters:
        params[column] = _supabase_filter_value(operator, value)
    return _supabase_request("PATCH", table, params=params, json=values, prefer=f"return={returning}") or []


def insert_rows(table, rows, upsert=False, on_conflict=None, returning="representation"):
    prefer = f"return={returning}"
    if upsert:
        prefer = f"{prefer},resolution=merge-duplicates"
    params = {}
    if on_conflict:
        params["on_conflict"] = on_conflict
    return _supabase_request("POST", table, params=params, json=rows, prefer=prefer) or []


def delete_rows(table, filters):
    params = {}
    for column, operator, value in filters:
        params[column] = _supabase_filter_value(operator, value)
    return _supabase_request("DELETE", table, params=params, prefer="return=minimal")


def get_db_connection():
    return None


def execute_read_query(query, params=None):
    return []


def execute_write_query(query, params=None):
    return None
