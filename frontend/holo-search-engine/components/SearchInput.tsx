"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const RUST_API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080";

  // Sync internal state when defaultValue changes (e.g., navigating back/forward)
  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    // Handle clicking outside to close dropdown
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    // Debounced fetch for autocomplete
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }
    
    // Don't fetch if it's the defaultValue just loaded
    if (value === defaultValue && !showDropdown) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${RUST_API_BASE}/search/autocomplete?q=${encodeURIComponent(value)}&limit=8`);
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      } catch (err) {
        console.error("Autocomplete fetch error:", err);
      }
    }, 200); // 200ms debounce

    return () => clearTimeout(timer);
  }, [value, RUST_API_BASE, defaultValue, showDropdown]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      setShowDropdown(false);
      onSearch(value);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setValue(suggestion);
    setShowDropdown(false);
    onSearch(suggestion);
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <form onSubmit={handleSubmit} className="w-full relative z-10">
        <InputGroup className="w-full h-12 shadow-sm rounded-full overflow-hidden focus-within:ring-2 focus-within:ring-primary bg-background">
          <InputGroupInput
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => {
              if (value.trim()) setShowDropdown(true);
            }}
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
      
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-2xl shadow-lg overflow-hidden z-50">
          <ul className="py-2">
            {suggestions.map((suggestion, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  className="w-full text-left px-5 py-2 hover:bg-muted focus:bg-muted transition-colors text-sm"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <Search className="w-4 h-4 inline-block mr-2 text-muted-foreground" />
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}