"use client";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Select } from "@/components/form-controls";
import {
  OPERATORS,
  type AttributeCriterion,
  type CriteriaGroup,
  type CriterionValueType,
} from "@/lib/flags";
const operatorOptions = OPERATORS.map((operator) => ({
  value: operator,
  label: operator.replaceAll("_", " "),
}));
const valueTypes = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "datetime", label: "Date / time" },
  { value: "list", label: "List" },
];
function inferredType(value: unknown): CriterionValueType {
  return Array.isArray(value)
    ? "list"
    : typeof value === "number"
      ? "number"
      : typeof value === "boolean"
        ? "boolean"
        : "string";
}
function typedValue(type: CriterionValueType, raw: string): unknown {
  if (type === "number") return raw === "" ? 0 : Number(raw);
  if (type === "boolean") return raw === "true";
  if (type === "list")
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  return raw;
}
function shownValue(item: AttributeCriterion) {
  const type = item.valueType ?? inferredType(item.value);
  return type === "list" && Array.isArray(item.value)
    ? item.value.join(", ")
    : String(item.value ?? "");
}
export function CriteriaBuilder({
  value,
  onChange,
  segments,
  allowSegments = true,
}: {
  value: CriteriaGroup;
  onChange: (value: CriteriaGroup) => void;
  segments: Array<{ key: string; name: string }>;
  allowSegments?: boolean;
}) {
  const setItem = (index: number, item: CriteriaGroup["items"][number]) =>
    onChange({
      ...value,
      items: value.items.map((current, itemIndex) =>
        itemIndex === index ? item : current,
      ),
    });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        Match{" "}
        <Select
          compact
          ariaLabel="Criteria matching mode"
          value={value.operator}
          onValueChange={(operator) =>
            onChange({ ...value, operator: operator as "all" | "any" })
          }
          options={[
            { value: "all", label: "all (AND)" },
            { value: "any", label: "any (OR)" },
          ]}
          className="w-32"
        />{" "}
        of the following criteria
      </div>
      {value.items.map((item, index) => {
        if ("items" in item) return null;
        const segment = item.kind === "segment";
        const type = !segment
          ? (item.valueType ?? inferredType(item.value))
          : "string";
        return (
          <div
            key={index}
            className="grid items-center gap-2 rounded-md border border-white/7 bg-black/10 p-2 lg:grid-cols-[120px_1fr_180px_120px_1fr_auto]"
          >
            <Select
              compact
              ariaLabel="Criterion type"
              value={item.kind}
              onValueChange={(kind) =>
                setItem(
                  index,
                  kind === "segment"
                    ? { kind: "segment", segment: segments[0]?.key ?? "" }
                    : {
                        kind: "attribute",
                        attribute: "",
                        operator: "equals",
                        valueType: "string",
                        value: "",
                      },
                )
              }
              options={[
                { value: "attribute", label: "Attribute" },
                ...(allowSegments
                  ? [{ value: "segment", label: "Segment" }]
                  : []),
              ]}
            />
            {segment ? (
              <>
                <Select
                  compact
                  ariaLabel="Segment"
                  value={item.segment}
                  onValueChange={(selected) =>
                    setItem(index, { ...item, segment: selected })
                  }
                  options={segments.map((option) => ({
                    value: option.key,
                    label: option.name,
                  }))}
                  placeholder="Choose segment"
                />
                <Select
                  compact
                  ariaLabel="Segment operator"
                  value={item.negate ? "not_in" : "in"}
                  onValueChange={(selected) =>
                    setItem(index, { ...item, negate: selected === "not_in" })
                  }
                  options={[
                    { value: "in", label: "is in segment" },
                    { value: "not_in", label: "is not in segment" },
                  ]}
                />
                <span />
                <span />
              </>
            ) : (
              <>
                <Input
                  compact
                  value={item.attribute}
                  onChange={(event) =>
                    setItem(index, { ...item, attribute: event.target.value })
                  }
                  placeholder="user.plan"
                  className="font-mono"
                />
                <Select
                  compact
                  ariaLabel="Comparison operator"
                  value={item.operator}
                  onValueChange={(operator) =>
                    setItem(index, {
                      ...item,
                      operator: operator as typeof item.operator,
                    })
                  }
                  options={operatorOptions}
                />
                <Select
                  compact
                  ariaLabel="Comparison value type"
                  value={type}
                  onValueChange={(nextType) =>
                    setItem(index, {
                      ...item,
                      valueType: nextType as CriterionValueType,
                      value: typedValue(nextType as CriterionValueType, ""),
                    })
                  }
                  options={valueTypes}
                  disabled={
                    item.operator === "exists" || item.operator === "not_exists"
                  }
                />
                {item.operator === "exists" ||
                item.operator === "not_exists" ? (
                  <span className="text-xs text-zinc-600">
                    No value required
                  </span>
                ) : type === "boolean" ? (
                  <Select
                    compact
                    ariaLabel="Comparison value"
                    value={String(item.value ?? false)}
                    onValueChange={(selected) =>
                      setItem(index, {
                        ...item,
                        valueType: "boolean",
                        value: selected === "true",
                      })
                    }
                    options={[
                      { value: "true", label: "True" },
                      { value: "false", label: "False" },
                    ]}
                  />
                ) : (
                  <Input
                    compact
                    type={
                      type === "number"
                        ? "number"
                        : type === "datetime"
                          ? "datetime-local"
                          : "text"
                    }
                    value={shownValue(item)}
                    onChange={(event) =>
                      setItem(index, {
                        ...item,
                        valueType: type,
                        value: typedValue(type, event.target.value),
                      })
                    }
                    placeholder={
                      type === "list"
                        ? "pro, enterprise"
                        : type === "string"
                          ? "pro"
                          : undefined
                    }
                    className={
                      type === "string" || type === "list" ? "font-mono" : ""
                    }
                  />
                )}
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({
                  ...value,
                  items: value.items.filter(
                    (_, itemIndex) => itemIndex !== index,
                  ),
                })
              }
              aria-label="Remove criterion"
              className="px-2 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              ...value,
              items: [
                ...value.items,
                {
                  kind: "attribute",
                  attribute: "",
                  operator: "equals",
                  valueType: "string",
                  value: "",
                },
              ],
            })
          }
          className="gap-1.5 text-teal-400"
        >
          <Plus className="h-3.5 w-3.5" /> Add criterion
        </Button>
      </div>
    </div>
  );
}
