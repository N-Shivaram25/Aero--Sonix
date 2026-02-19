import { useState, useMemo, useEffect, useRef } from "react";
import { SearchIcon, GlobeIcon, ChevronDownIcon } from "lucide-react";

const SupportedLanguagesDropdown = ({ onLanguageSelect, currentLanguage, savingLanguage }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  // Nova 3 supported languages
  const nova3Languages = [
    { code: "multi", name: "Multilingual (English, Spanish, French, German, Hindi, Russian, Portuguese, Japanese, Italian, Dutch)" },
    { code: "ar", name: "Arabic" },
    { code: "ar-AE", name: "Arabic (UAE)" },
    { code: "ar-SA", name: "Arabic (Saudi Arabia)" },
    { code: "ar-QA", name: "Arabic (Qatar)" },
    { code: "ar-KW", name: "Arabic (Kuwait)" },
    { code: "ar-SY", name: "Arabic (Syria)" },
    { code: "ar-LB", name: "Arabic (Lebanon)" },
    { code: "ar-PS", name: "Arabic (Palestine)" },
    { code: "ar-JO", name: "Arabic (Jordan)" },
    { code: "ar-EG", name: "Arabic (Egypt)" },
    { code: "ar-SD", name: "Arabic (Sudan)" },
    { code: "ar-TD", name: "Arabic (Chad)" },
    { code: "ar-MA", name: "Arabic (Morocco)" },
    { code: "ar-DZ", name: "Arabic (Algeria)" },
    { code: "ar-TN", name: "Arabic (Tunisia)" },
    { code: "ar-IQ", name: "Arabic (Iraq)" },
    { code: "ar-IR", name: "Arabic (Iran)" },
    { code: "be", name: "Belarusian" },
    { code: "bn", name: "Bengali" },
    { code: "bs", name: "Bosnian" },
    { code: "bg", name: "Bulgarian" },
    { code: "ca", name: "Catalan" },
    { code: "hr", name: "Croatian" },
    { code: "cs", name: "Czech" },
    { code: "da", name: "Danish" },
    { code: "da-DK", name: "Danish (Denmark)" },
    { code: "nl", name: "Dutch" },
    { code: "en", name: "English" },
    { code: "en-US", name: "English (US)" },
    { code: "en-AU", name: "English (Australia)" },
    { code: "en-GB", name: "English (UK)" },
    { code: "en-IN", name: "English (India)" },
    { code: "en-NZ", name: "English (New Zealand)" },
    { code: "et", name: "Estonian" },
    { code: "fi", name: "Finnish" },
    { code: "nl-BE", name: "Flemish" },
    { code: "fr", name: "French" },
    { code: "fr-CA", name: "French (Canada)" },
    { code: "de", name: "German" },
    { code: "de-CH", name: "German (Switzerland)" },
    { code: "el", name: "Greek" },
    { code: "he", name: "Hebrew" },
    { code: "hi", name: "Hindi" },
    { code: "hu", name: "Hungarian" },
    { code: "id", name: "Indonesian" },
    { code: "it", name: "Italian" },
    { code: "ja", name: "Japanese" },
    { code: "kn", name: "Kannada" },
    { code: "ko", name: "Korean" },
    { code: "ko-KR", name: "Korean (South Korea)" },
    { code: "lv", name: "Latvian" },
    { code: "lt", name: "Lithuanian" },
    { code: "mk", name: "Macedonian" },
    { code: "ms", name: "Malay" },
    { code: "mr", name: "Marathi" },
    { code: "no", name: "Norwegian" },
    { code: "fa", name: "Persian" },
    { code: "pl", name: "Polish" },
    { code: "pt", name: "Portuguese" },
    { code: "pt-BR", name: "Portuguese (Brazil)" },
    { code: "pt-PT", name: "Portuguese (Portugal)" },
    { code: "ro", name: "Romanian" },
    { code: "ru", name: "Russian" },
    { code: "sr", name: "Serbian" },
    { code: "sk", name: "Slovak" },
    { code: "sl", name: "Slovenian" },
    { code: "es", name: "Spanish" },
    { code: "es-419", name: "Spanish (Latin America)" },
    { code: "sv", name: "Swedish" },
    { code: "sv-SE", name: "Swedish (Sweden)" },
    { code: "tl", name: "Tagalog" },
    { code: "ta", name: "Tamil" },
    { code: "te", name: "Telugu" },
    { code: "tr", name: "Turkish" },
    { code: "uk", name: "Ukrainian" },
    { code: "ur", name: "Urdu" },
    { code: "vi", name: "Vietnamese" }
  ];

  // Nova 2 supported languages
  const nova2Languages = [
    { code: "multi", name: "Multilingual (Spanish + English)" },
    { code: "bg", name: "Bulgarian" },
    { code: "ca", name: "Catalan" },
    { code: "zh", name: "Chinese (Mandarin, Simplified)" },
    { code: "zh-CN", name: "Chinese (Mandarin, Simplified - China)" },
    { code: "zh-Hans", name: "Chinese (Mandarin, Simplified)" },
    { code: "zh-TW", name: "Chinese (Mandarin, Traditional)" },
    { code: "zh-Hant", name: "Chinese (Mandarin, Traditional)" },
    { code: "zh-HK", name: "Chinese (Cantonese, Traditional)" },
    { code: "cs", name: "Czech" },
    { code: "da", name: "Danish" },
    { code: "da-DK", name: "Danish (Denmark)" },
    { code: "nl", name: "Dutch" },
    { code: "en", name: "English" },
    { code: "en-US", name: "English (US)" },
    { code: "en-AU", name: "English (Australia)" },
    { code: "en-GB", name: "English (UK)" },
    { code: "en-NZ", name: "English (New Zealand)" },
    { code: "en-IN", name: "English (India)" },
    { code: "et", name: "Estonian" },
    { code: "fi", name: "Finnish" },
    { code: "nl-BE", name: "Flemish" },
    { code: "fr", name: "French" },
    { code: "fr-CA", name: "French (Canada)" },
    { code: "de", name: "German" },
    { code: "de-CH", name: "German (Switzerland)" },
    { code: "el", name: "Greek" },
    { code: "hi", name: "Hindi" },
    { code: "hu", name: "Hungarian" },
    { code: "id", name: "Indonesian" },
    { code: "it", name: "Italian" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" },
    { code: "ko-KR", name: "Korean (South Korea)" },
    { code: "lv", name: "Latvian" },
    { code: "lt", name: "Lithuanian" },
    { code: "ms", name: "Malay" },
    { code: "no", name: "Norwegian" },
    { code: "pl", name: "Polish" },
    { code: "pt", name: "Portuguese" },
    { code: "pt-BR", name: "Portuguese (Brazil)" },
    { code: "pt-PT", name: "Portuguese (Portugal)" },
    { code: "ro", name: "Romanian" },
    { code: "ru", name: "Russian" },
    { code: "sk", name: "Slovak" },
    { code: "es", name: "Spanish" },
    { code: "es-419", name: "Spanish (Latin America)" },
    { code: "sv", name: "Swedish" },
    { code: "sv-SE", name: "Swedish (Sweden)" },
    { code: "th", name: "Thai" },
    { code: "th-TH", name: "Thai (Thailand)" },
    { code: "tr", name: "Turkish" },
    { code: "uk", name: "Ukrainian" },
    { code: "vi", name: "Vietnamese" }
  ];

  // Filter languages based on search term
  const filteredNova3Languages = useMemo(() => {
    if (!searchTerm) return nova3Languages;
    return nova3Languages.filter(lang => 
      lang.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lang.code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  const filteredNova2Languages = useMemo(() => {
    if (!searchTerm) return nova2Languages;
    return nova2Languages.filter(lang => 
      lang.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lang.code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  const allLanguages = [...nova3Languages, ...nova2Languages];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLanguageSelect = (code) => {
    if (onLanguageSelect) {
      onLanguageSelect(code);
    }
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-outline btn-sm flex items-center gap-2"
      >
        <GlobeIcon className="w-4 h-4" />
        Supported Languages
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 right-0 w-full bg-black border border-gray-700 rounded-lg shadow-2xl z-50 max-h-96 overflow-hidden">
          {/* Search Bar with Count */}
          <div className="p-3 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search languages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-900 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                />
              </div>
              <div className="bg-gray-800 px-3 py-2 rounded-md border border-gray-600">
                <span className="text-xs text-gray-400">{allLanguages.length} languages</span>
              </div>
            </div>
          </div>

          {/* Current Language Display */}
          <div className="px-3 py-2 border-b border-gray-700">
            <div className="text-xs text-gray-400">
              Your language: <span className="text-white font-medium">{currentLanguage || "Not set"}</span>
            </div>
          </div>

          {/* Language Lists */}
          <div className="overflow-y-auto max-h-64">
            {/* Nova 3 Section */}
            <div className="border-b border-gray-700">
              <div className="px-3 py-2 bg-gray-900 sticky top-0 z-10">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Nova 3 - Latest Generation
                </h3>
                <p className="text-xs text-gray-400 mt-1">Highest accuracy, multilingual support</p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredNova3Languages.length === 0 ? (
                  <div className="px-3 py-4 text-center text-gray-400 text-sm">
                    No languages found
                  </div>
                ) : (
                  filteredNova3Languages.map((lang) => {
                    const isActive = currentLanguage === lang.code;
                    return (
                      <button
                        key={`nova3-${lang.code}`}
                        onClick={() => handleLanguageSelect(lang.code)}
                        disabled={savingLanguage}
                        className={`w-full px-3 py-2 text-left hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-b-0 ${
                          isActive ? 'bg-blue-900 text-white' : 'text-gray-200'
                        } ${savingLanguage ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium">{lang.name}</span>
                          <span className="text-xs text-gray-400">{lang.code}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Nova 2 Section */}
            <div>
              <div className="px-3 py-2 bg-gray-900 sticky top-0 z-10">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Nova 2 - Previous Generation
                </h3>
                <p className="text-xs text-gray-400 mt-1">For languages not in Nova 3, filler word detection</p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredNova2Languages.length === 0 ? (
                  <div className="px-3 py-4 text-center text-gray-400 text-sm">
                    No languages found
                  </div>
                ) : (
                  filteredNova2Languages.map((lang) => {
                    const isActive = currentLanguage === lang.code;
                    return (
                      <button
                        key={`nova2-${lang.code}`}
                        onClick={() => handleLanguageSelect(lang.code)}
                        disabled={savingLanguage}
                        className={`w-full px-3 py-2 text-left hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-b-0 ${
                          isActive ? 'bg-blue-900 text-white' : 'text-gray-200'
                        } ${savingLanguage ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium">{lang.name}</span>
                          <span className="text-xs text-gray-400">{lang.code}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-3 py-2 bg-gray-900 border-t border-gray-700">
            <div className="text-xs text-gray-400 text-center">
              Nova 2 & Nova 3 models available
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportedLanguagesDropdown;
