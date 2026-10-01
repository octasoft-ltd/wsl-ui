import type { ContainerCreateSpec } from "../types/containers";

export interface RecipeField {
  key: string;
  label: string;
  value: string;
  secret?: boolean;
  required?: boolean;
}
export interface ContainerRecipe {
  id: string;
  name: string;
  category: "data" | "messaging" | "web" | "monitoring";
  image: string;
  documentation: string;
  ports: Array<[host: number, container: number]>;
  volumes: Array<[suffix: string, target: string]>;
  fields: RecipeField[];
  command?: string[];
}

// Reviewed single-container recipes. Tags track stable channels or selected major/minor
// releases; the runtime resolves the pulled image to an immutable ID at creation.
export const containerRecipes: ContainerRecipe[] = [
  {
    id: "postgres",
    name: "PostgreSQL",
    category: "data",
    image: "docker.io/library/postgres:18",
    documentation: "https://hub.docker.com/_/postgres",
    ports: [[5432, 5432]],
    volumes: [["data", "/var/lib/postgresql"]],
    fields: [
      { key: "POSTGRES_DB", label: "database", value: "app", required: true },
      {
        key: "POSTGRES_USER",
        label: "databaseUser",
        value: "app",
        required: true,
      },
      {
        key: "POSTGRES_PASSWORD",
        label: "databasePassword",
        value: "",
        secret: true,
        required: true,
      },
    ],
  },
  {
    id: "mariadb",
    name: "MariaDB",
    category: "data",
    image: "docker.io/library/mariadb:11.8",
    documentation: "https://hub.docker.com/_/mariadb",
    ports: [[3306, 3306]],
    volumes: [["data", "/var/lib/mysql"]],
    fields: [
      {
        key: "MARIADB_DATABASE",
        label: "database",
        value: "app",
        required: true,
      },
      {
        key: "MARIADB_USER",
        label: "databaseUser",
        value: "app",
        required: true,
      },
      {
        key: "MARIADB_PASSWORD",
        label: "databasePassword",
        value: "",
        secret: true,
        required: true,
      },
      {
        key: "MARIADB_ROOT_PASSWORD",
        label: "rootPassword",
        value: "",
        secret: true,
        required: true,
      },
    ],
  },
  {
    id: "redis",
    name: "Redis",
    category: "data",
    image: "docker.io/library/redis:8",
    documentation: "https://hub.docker.com/_/redis",
    ports: [[6379, 6379]],
    volumes: [["data", "/data"]],
    fields: [],
    command: ["redis-server", "--appendonly", "yes"],
  },
  {
    id: "valkey",
    name: "Valkey",
    category: "data",
    image: "docker.io/valkey/valkey:8",
    documentation: "https://valkey.io/topics/installation/",
    ports: [[6380, 6379]],
    volumes: [["data", "/data"]],
    fields: [],
    command: ["valkey-server", "--appendonly", "yes"],
  },
  {
    id: "rabbitmq",
    name: "RabbitMQ",
    category: "messaging",
    image: "docker.io/library/rabbitmq:4-management",
    documentation: "https://www.rabbitmq.com/docs/download",
    ports: [
      [5672, 5672],
      [15672, 15672],
    ],
    volumes: [["data", "/var/lib/rabbitmq"]],
    fields: [
      {
        key: "RABBITMQ_DEFAULT_USER",
        label: "username",
        value: "app",
        required: true,
      },
      {
        key: "RABBITMQ_DEFAULT_PASS",
        label: "password",
        value: "",
        secret: true,
        required: true,
      },
      // Keep the data directory stable across container recreation/hostname changes.
      {
        key: "RABBITMQ_NODENAME",
        label: "nodeName",
        value: "rabbit@localhost",
        required: true,
      },
    ],
  },
  {
    id: "mailpit",
    name: "Mailpit",
    category: "messaging",
    image: "docker.io/axllent/mailpit:v1",
    documentation: "https://mailpit.axllent.org/docs/install/docker/",
    ports: [
      [8025, 8025],
      [1025, 1025],
    ],
    volumes: [["data", "/data"]],
    fields: [
      {
        key: "MP_DATABASE",
        label: "mailDatabase",
        value: "/data/mailpit.db",
        required: true,
      },
    ],
  },
  {
    id: "adminer",
    name: "Adminer",
    category: "web",
    image: "docker.io/library/adminer:5",
    documentation: "https://hub.docker.com/_/adminer",
    ports: [[8081, 8080]],
    volumes: [],
    fields: [],
  },
  {
    id: "nginx",
    name: "Nginx",
    category: "web",
    image: "docker.io/library/nginx:stable-alpine",
    documentation: "https://hub.docker.com/_/nginx",
    ports: [[8080, 80]],
    volumes: [],
    fields: [],
  },
  {
    id: "caddy",
    name: "Caddy",
    category: "web",
    image: "docker.io/library/caddy:2",
    documentation: "https://hub.docker.com/_/caddy",
    ports: [[8082, 80]],
    volumes: [
      ["data", "/data"],
      ["config", "/config"],
    ],
    fields: [],
  },
  {
    id: "grafana",
    name: "Grafana",
    category: "monitoring",
    image: "docker.io/grafana/grafana:12.4",
    documentation:
      "https://grafana.com/docs/grafana/latest/setup-grafana/installation/docker/",
    ports: [[3000, 3000]],
    volumes: [["data", "/var/lib/grafana"]],
    fields: [
      {
        key: "GF_SECURITY_ADMIN_USER",
        label: "adminUser",
        value: "admin",
        required: true,
      },
      {
        key: "GF_SECURITY_ADMIN_PASSWORD",
        label: "adminPassword",
        value: "",
        secret: true,
        required: true,
      },
    ],
  },
];

export function createRecipeSpec(
  recipe: ContainerRecipe,
  existingNames: string[],
): ContainerCreateSpec {
  const names = new Set(existingNames.map((name) => name.toLowerCase()));
  let name = recipe.id;
  for (let suffix = 2; names.has(name.toLowerCase()); suffix++)
    name = `${recipe.id}-${suffix}`;
  const storagePrefix = `${name}-${crypto.randomUUID().slice(0, 8)}`;
  return {
    name,
    image: recipe.image,
    start: true,
    ports: recipe.ports.map(([hostPort, containerPort]) => ({
      hostIp: "127.0.0.1",
      hostPort,
      containerPort,
      protocol: "tcp",
    })),
    mounts: recipe.volumes.map(([suffix, target]) => ({
      kind: "volume",
      source: `${storagePrefix}-${suffix}`,
      name: `${storagePrefix}-${suffix}`,
      target,
      readOnly: false,
    })),
    environment: recipe.fields.map((field) => ({
      key: field.key,
      value: field.value,
    })),
    command: [...(recipe.command ?? [])],
    entrypoint: null,
    workingDirectory: null,
    user: null,
    cpus: null,
    memoryMb: null,
  };
}
