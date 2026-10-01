import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  containerRecipes,
  type ContainerRecipe,
} from "../../data/containerRecipes";
import { useContainerStore } from "../../store/containerStore";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal, ModalHeader, ModalBody } from "../ui/Modal";
import { ContainerForm } from "./ContainerForm";

export function AddContainerDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const [selected, setSelected] = useState<ContainerRecipe | "custom" | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const containers = useContainerStore((state) => state.containers);
  if (selected)
    return (
      <ContainerForm
        recipe={selected === "custom" ? undefined : selected}
        existingNames={containers.map((container) => container.name)}
        onBack={() => setSelected(null)}
        onClose={onClose}
      />
    );
  const recipes = containerRecipes.filter(
    (recipe) =>
      (category === "all" || recipe.category === category) &&
      `${recipe.name} ${recipe.image} ${t(`containers.catalog.descriptions.${recipe.id}`)}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      labelledBy={titleId}
      className="max-h-[90vh] overflow-y-auto"
    >
      <ModalHeader
        titleId={titleId}
        title={t("containers.catalog.title")}
        subtitle={t("containers.catalog.subtitle")}
        onClose={onClose}
      />
      <ModalBody className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <Input
              label={t("containers.catalog.search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              data-testid="container-catalog-search"
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => setSelected("custom")}
            data-testid="container-custom-image"
          >
            {t("containers.catalog.custom")}
          </Button>
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t("containers.catalog.category")}
        >
          {["all", "data", "messaging", "web", "monitoring"].map((value) => (
            <Button
              key={value}
              size="sm"
              variant={category === value ? "accent" : "secondary"}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {t(`containers.catalog.categories.${value}`)}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {recipes.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              data-testid={`container-recipe-${recipe.id}`}
              onClick={() => setSelected(recipe)}
              className="flex gap-4 items-start p-4 rounded-lg border border-theme-border-secondary bg-theme-bg-secondary hover:bg-theme-bg-tertiary hover:border-theme-accent-primary focus-visible:outline-2 focus-visible:outline-theme-accent-primary text-left min-w-0"
            >
              <img
                src={`/container-logos/${recipe.id}.svg`}
                alt=""
                width="40"
                height="40"
                className="w-10 h-10 object-contain shrink-0 mt-1"
              />
              <span className="min-w-0 space-y-1 block">
                <span className="font-semibold text-theme-text-primary block">
                  {recipe.name}
                </span>
                <span className="text-sm text-theme-text-secondary block">
                  {t(`containers.catalog.descriptions.${recipe.id}`)}
                </span>
                <span className="text-xs text-theme-text-muted break-all block">
                  {recipe.image.replace("docker.io/", "")}
                </span>
              </span>
            </button>
          ))}
        </div>
        {recipes.length === 0 && (
          <p role="status" className="text-theme-text-secondary py-6">
            {t("containers.catalog.empty")}
          </p>
        )}
        <p className="text-xs text-theme-text-muted">
          {t("containers.catalog.footer")}
        </p>
      </ModalBody>
    </Modal>
  );
}
