import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

let tokenGetter = async () => null;
export const getApiToken = () => tokenGetter();

export function makeClient(getToken) {
  tokenGetter = getToken;
  const client = axios.create({ baseURL: API });
  client.interceptors.request.use(async (config) => {
    try {
      const token = await getToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {}
    return config;
  });
  return client;
}
