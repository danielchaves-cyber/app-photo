# Feed Ásia

Feed shuffle de fotos que se atualiza sozinho a partir de feeds RSS da imprensa asiática.

## Como funciona
- `scripts/update-feed.mjs` lê os feeds, extrai foto, fonte, data, link e país, e grava `docs/photos.json`.
- `docs/index.html` é o app: lê o `photos.json` e sorteia as fotos.
- `.github/workflows/update.yml` roda o script a cada 4 horas no GitHub e salva o resultado.

## Passo a passo
1. Crie uma conta e um repositório no GitHub e envie esta pasta inteira para ele.
2. (Opcional) Em **Settings → Secrets and variables → Actions**, crie o segredo `ANTHROPIC_API_KEY`.
   Com ele, a descrição de cada foto é gerada em português. Sem ele, o app mostra o título original da notícia.
3. Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/docs`.
4. Em **Actions → Atualizar fotos → Run workflow**, rode a primeira atualização.
5. Abra o link do GitHub Pages. Pronto.

## Testar no computador
    npm install
    npm run update        # veja no log quais feeds funcionaram (✓) ou falharam (✗)
    npx serve docs        # abre o app local

## Ajustes
- **Fontes**: edite a lista `FEEDS` no topo do script. Remova ou troque os feeds que falharem.
- **Repercussão**: o app usa as matérias de destaque de cada veículo; não mede audiência real.
- **Direitos**: as imagens pertencem aos veículos. O app só exibe com crédito e link para a fonte original.
  Confira os termos de cada veículo antes de divulgar publicamente.
