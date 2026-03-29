import { handleMetaWebhookGet, handleMetaWebhookPost } from "@/lib/crm/integrations/meta-webhook";

export async function GET(request) {
  return handleMetaWebhookGet(request);
}

export async function POST(request) {
  return handleMetaWebhookPost(request);
}
