export async function resolveWebhookService(service) {
  if (service) return service;

  const supabaseServiceModule = await import("../supabase-service.js");
  return supabaseServiceModule.getServiceSupabaseClient();
}
