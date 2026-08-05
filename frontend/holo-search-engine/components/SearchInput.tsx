"use client";

import { useState, FormEvent, useEffect } from "react";
import { Search } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

interface SearchInputProps {
  defaultValue?: string;
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function SearchInput({
  defaultValue = "",
  onSearch,
  placeholder = "Search anime, characters, studios...",
}: SearchInputProps) {
  const [value, setValue] = useState(defaultValue);

  // Sync internal state when defaultValue changes (e.g., navigating back/forward)
  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSearch(value);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <InputGroup className="w-full h-12 shadow-sm rounded-full overflow-hidden focus-within:ring-2 focus-within:ring-primary">
        <InputGroupInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="h-12 px-5 text-base border-none focus-visible:ring-0"
        />
        <InputGroupAddon className="bg-transparent border-none pr-3">
          <button
            type="submit"
            className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Submit search"
          >
            <Search className="w-5 h-5" />
          </button>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}