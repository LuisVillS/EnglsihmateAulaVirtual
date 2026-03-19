from database.repository import (
    get_student_by_discord_id,
    get_student_by_email,
    update_student_discord_link,
)
from services.member_sync import sync_member_roles


def _discord_username(user):
    return user.name or getattr(user, "global_name", None) or getattr(user, "display_name", None)


def setup(bot):
    async def _handle_verify(ctx, email: str):
        if ctx.guild is None:
            await ctx.respond("Este comando solo se puede usar en un servidor.", ephemeral=True)
            return

        discord_id = str(ctx.author.id)
        student_by_email = get_student_by_email(email)
        if not student_by_email or student_by_email.get("role") != "student":
            await ctx.respond("No encontre un estudiante con ese correo.", ephemeral=True)
            return

        student_by_discord = get_student_by_discord_id(discord_id)
        if student_by_discord and student_by_discord.get("id") != student_by_email.get("id"):
            await ctx.respond(
                "Este Discord ya esta vinculado a otro estudiante. Si necesitas corregirlo, pide a un admin que lo haga desde el panel de Discord.",
                ephemeral=True,
            )
            return

        linked_discord_id = str(student_by_email.get("discord_user_id") or "").strip()
        if linked_discord_id and linked_discord_id != discord_id:
            await ctx.respond(
                "Ese correo ya esta vinculado a otro Discord. No puedo sobrescribirlo desde /verify.",
                ephemeral=True,
            )
            return

        update_student_discord_link(
            student_by_email["id"],
            discord_id,
            discord_username=_discord_username(ctx.author),
        )

        result = await sync_member_roles(ctx.author)
        target_role_name = result.get("target_role_name") or ""
        removed = result.get("removed") or []
        if target_role_name:
            if linked_discord_id == discord_id:
                message = f"Tu cuenta ya estaba vinculada. Rol academico sincronizado: {target_role_name}."
            else:
                message = f"Cuenta vinculada correctamente. Rol academico asignado: {target_role_name}."
            if removed:
                message = f"{message} Se removieron: {', '.join(removed)}."
            await ctx.respond(message, ephemeral=True)
            return

        await ctx.respond(
            "La cuenta quedo vinculada, pero no encontre una comision activa con curso y periodo para construir tu rol academico.",
            ephemeral=True,
        )

    @bot.slash_command(
        name="verify",
        description="Vincula tu Discord con el Aula Virtual y sincroniza tu rol academico",
    )
    async def verify(ctx, email: str):
        await _handle_verify(ctx, email)
