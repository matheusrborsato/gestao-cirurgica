# Gestão Cirúrgica v3

## Como publicar no Vercel

1. Acesse vercel.com e faça login
2. Clique em "Add New Project" → "Import Git Repository"
   - Ou: arraste esta pasta para o Vercel (opção "Deploy without Git")
3. Clique em "Deploy"
4. Pronto — sua URL estará no formato: https://gestao-cirurgica.vercel.app

## Configuração do Storage (para anexos)

No Supabase, execute no SQL Editor:

```sql
insert into storage.buckets (id, name, public) values ('anexos', 'anexos', true);
```

## Configuração da IA (opcional)

Em app.js, linha 4, substitua 'SUA_CHAVE_CLAUDE_AQUI' pela sua chave da API do Claude.
Obtenha em: https://console.anthropic.com

## Criar usuários

No Supabase → Authentication → Users → "Invite User"
Depois execute:
```sql
update usuarios set nome = 'Nome do Usuário', perfil = 'medico' where email = 'email@exemplo.com';
```

## Perfis de acesso
- **medico**: acesso completo (prontuários, relatórios, usuários, IA)
- **secretaria**: procedimentos, pacientes, pagamentos, tabela de valores
