import { User, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppHeaderProps {
  user?: {
    name: string;
    email: string;
  };
  onLogout?: () => void;
}

export const AppHeader = ({ user, onLogout }: AppHeaderProps) => {
  return (
    <header className="bg-gradient-primary shadow-primary border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <img 
                  src="/lovable-uploads/3a9d70a7-3c10-4786-9425-c58a607bc9aa.png" 
                  alt="BPF Logo" 
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div className="text-white">
                <h1 className="text-xl font-bold">BPF Check</h1>
                <p className="text-xs text-primary-foreground/80">Sistema de Auditoria Sanitária</p>
              </div>
            </div>
          </div>

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                  <User className="w-4 h-4 mr-2" />
                  {user.name}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem>
                  <Settings className="w-4 h-4 mr-2" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
};