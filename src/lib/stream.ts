
import axios, {
  type AxiosRequestConfig,
  type AxiosResponseHeaders,
} from "axios";
import type { Readable } from "node:stream";

export const streamBlogger = (url: string, config?: AxiosRequestConfig) => {
  const controller = new AbortController();
  let stream: Readable | undefined = undefined;

  const abort = () => {
    controller.abort();
    if (stream) {
      (stream as Readable).destroy();
    }
  };

  return axios.get(url).then(({ data, headers }) => {
    const json = (data as string).match(/var VIDEO_CONFIG = (.*)\n/m);

    if (!json?.length) throw new Error("Video invalid");

    const parsed = JSON.parse(json[1]!);
    const playURL = parsed.streams[0].play_url;

    return axios
      .get(playURL, {
        ...config,
        responseType: "stream",
        signal: controller.signal,
      })
      .then(({ data, headers }) => {
        stream = data;

        return {
          abort,
          stream: stream!,
          headers: headers as AxiosResponseHeaders,
        };
      });
  });
};

export const streamPremium = (url: string, config?: AxiosRequestConfig) => {
  const controller = new AbortController();
  let stream: Readable | undefined = undefined;

  const abort = () => {
    controller.abort();
    if (stream) {
      (stream as Readable).destroy();
    }
  };

  return axios
    .get(url, {
      ...config,
      headers: { ...config?.headers, "User-Agent": "Mozilla/5.0 (Windows NT)" },
      responseType: "stream",
      signal: controller.signal,
    })
    .then(({ data, headers }) => {
      stream = data;

      return {
        abort,
        stream: stream!,
        headers: headers as AxiosResponseHeaders,
      };
    });
};

export const streamPixeldrain = (url: string, config?: AxiosRequestConfig) => {
  const id = new URL(url).pathname.split("/").pop();

  const controller = new AbortController();
  let stream: Readable | undefined = undefined;

  const abort = () => {
    controller.abort();
    if (stream) {
      (stream as Readable).destroy();
    }
  };

  return axios
    .get(`https://pixeldrain.com/api/file/${id}`, {
      ...config,
      responseType: "stream",
      signal: controller.signal,
    })
    .then(({ data, headers }) => {
      stream = data;

      return {
        abort,
        stream: stream!,
        headers: headers as AxiosResponseHeaders,
      };
    });
};

export const streamFiledon = (url: string, config?: AxiosRequestConfig) => {
  const slug = new URL(url).pathname.split("/").pop();

  const controller = new AbortController();
  let stream: Readable | undefined = undefined;

  const abort = () => {
    controller.abort();
    if (stream) {
      (stream as Readable).destroy();
    }
  };

  return axios
    .post("https://filedon.co/get-url", {
      slug,
    })
    .then(({ data })
    =>
      axios
        .get(data.data.url, {
          ...config,
          signal: controller.signal,
          responseType: "stream",
        })
        .then(({ data, headers }) => {
          stream = data;

          return {
            abort,
            stream: stream!,
            headers: headers as AxiosResponseHeaders,
          };
        })
    );
};
