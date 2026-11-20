import { handleInstitutionalApi } from '../institutional-api.mjs';

export default async function handler(req, res) {
  await handleInstitutionalApi(req, res, '/api/institutional-booking');
}
