# Phase 3 statistics (section 8).
#   Rscript stats/phase3_models.R <blocks.csv> <ranks.csv> <output dir> <margin>
# Writes contrasts.csv, tost.csv, rankings.csv, pairwise_ranks.csv, plackett_luce.csv and status.csv.
suppressPackageStartupMessages({
  library(lme4)
  library(lmerTest)
  library(emmeans)
})
emm_options(lmerTest.limit = 100000, pbkrtest.limit = 0)

args <- commandArgs(trailingOnly = TRUE)
blocks <- read.csv(args[[1]], stringsAsFactors = FALSE)
ranks <- read.csv(args[[2]], stringsAsFactors = FALSE)
out_dir <- args[[3]]
margin <- as.numeric(args[[4]])

conditions <- c("static", "global", "cluster5", "personalFull")
blocks$condition <- factor(blocks$condition, levels = conditions)
blocks$position <- factor(blocks$position)
blocks$task <- factor(blocks$task)
blocks$participant <- factor(blocks$participant)

# Each adaptive condition vs static, and cluster5 vs personalFull.
wanted <- list(
  "global - static" = c(-1, 1, 0, 0),
  "cluster5 - static" = c(-1, 0, 1, 0),
  "personalFull - static" = c(-1, 0, 0, 1),
  "cluster5 - personalFull" = c(0, 0, 1, -1)
)

status <- list()
fit_outcome <- function(outcome, logistic = FALSE) {
  d <- blocks[!is.na(blocks[[outcome]]), ]
  messages <- character()
  note <- function(w) {
    messages <<- c(messages, conditionMessage(w))
    invokeRestart("muffleWarning")
  }
  formula <- as.formula(paste(outcome, "~ condition + position + task + (1 | participant)"))
  model <- withCallingHandlers(
    if (logistic) {
      glmer(formula, data = d, family = binomial, control = glmerControl(optimizer = "bobyqa", optCtrl = list(maxfun = 2e5)))
    } else {
      lmer(formula, data = d)
    },
    warning = note
  )
  status[[length(status) + 1]] <<- data.frame(
    outcome = outcome, n_rows = nrow(d), n_participants = length(unique(d$participant)),
    singular = isSingular(model), warnings = paste(unique(messages), collapse = " | ")
  )
  grid <- if (logistic) emmeans(model, ~condition) else emmeans(model, ~condition, lmer.df = "satterthwaite")
  fitted <- contrast(grid, method = wanted, adjust = "none")
  table <- as.data.frame(fitted)
  ci <- as.data.frame(confint(fitted, level = 0.95))
  statistic <- if ("t.ratio" %in% names(table)) table$t.ratio else table$z.ratio
  df <- if ("df" %in% names(table)) table$df else Inf
  means <- as.data.frame(grid)
  low <- if ("lower.CL" %in% names(means)) means$lower.CL else means$asymp.LCL
  high <- if ("upper.CL" %in% names(means)) means$upper.CL else means$asymp.UCL
  list(
    contrasts = data.frame(
      outcome = outcome, contrast = table$contrast, estimate = table$estimate, se = table$SE, df = df,
      statistic = statistic, p = table$p.value, p_holm = p.adjust(table$p.value, "holm"),
      ci_low = if ("lower.CL" %in% names(ci)) ci$lower.CL else ci$asymp.LCL,
      ci_high = if ("upper.CL" %in% names(ci)) ci$upper.CL else ci$asymp.UCL
    ),
    means = data.frame(outcome = outcome, condition = means$condition, estimate = means$emmean, se = means$SE, ci_low = low, ci_high = high),
    grid = grid
  )
}

fits <- list(
  quis = fit_outcome("quis"),
  ues = fit_outcome("ues"),
  log_time = fit_outcome("log_time"),
  items_found = fit_outcome("items_found"),
  success = fit_outcome("success", logistic = TRUE)
)
write.csv(do.call(rbind, lapply(fits, `[[`, "contrasts")), file.path(out_dir, "contrasts.csv"), row.names = FALSE)
write.csv(do.call(rbind, lapply(fits, `[[`, "means")), file.path(out_dir, "means.csv"), row.names = FALSE)
write.csv(do.call(rbind, status), file.path(out_dir, "status.csv"), row.names = FALSE)

# H4b: TOST on the cluster5 - personalFull contrast of the QUIS model.
row <- fits$quis$contrasts[fits$quis$contrasts$contrast == "cluster5 - personalFull", ]
t_lower <- (row$estimate + margin) / row$se
t_upper <- (row$estimate - margin) / row$se
p_lower <- pt(t_lower, row$df, lower.tail = FALSE)
p_upper <- pt(t_upper, row$df, lower.tail = TRUE)
critical <- qt(0.95, row$df)
tost <- data.frame(
  source = "LMM contrast", estimate = row$estimate, se = row$se, df = row$df, margin = margin,
  ci90_low = row$estimate - critical * row$se, ci90_high = row$estimate + critical * row$se,
  t_lower = t_lower, p_lower = p_lower, t_upper = t_upper, p_upper = p_upper, p_tost = max(p_lower, p_upper),
  equivalent = max(p_lower, p_upper) < 0.05
)

# Cross-check with TOSTER on the paired condition means. It ignores position and task, so it can differ a little.
wide <- reshape(aggregate(quis ~ participant + condition, blocks, mean), idvar = "participant", timevar = "condition", direction = "wide")
wide <- wide[complete.cases(wide[, c("quis.cluster5", "quis.personalFull")]), ]
check <- try(
  {
    difference <- wide$quis.cluster5 - wide$quis.personalFull
    result <- TOSTER::tsum_TOST(
      m1 = mean(wide$quis.cluster5), sd1 = sd(wide$quis.cluster5), n1 = nrow(wide),
      m2 = mean(wide$quis.personalFull), sd2 = sd(wide$quis.personalFull), n2 = nrow(wide),
      r12 = if (sd(difference) > 0) cor(wide$quis.cluster5, wide$quis.personalFull) else 0.99,
      hypothesis = "EQU", paired = TRUE, eqb = margin, alpha = 0.05
    )
    table <- result$TOST
    data.frame(
      source = "TOSTER paired means", estimate = mean(difference), se = sd(difference) / sqrt(nrow(wide)), df = nrow(wide) - 1,
      margin = margin, ci90_low = result$effsize["Raw", "lower.ci"], ci90_high = result$effsize["Raw", "upper.ci"],
      t_lower = table["TOST Lower", "t"], p_lower = table["TOST Lower", "p.value"],
      t_upper = table["TOST Upper", "t"], p_upper = table["TOST Upper", "p.value"],
      p_tost = max(table["TOST Lower", "p.value"], table["TOST Upper", "p.value"]),
      equivalent = max(table["TOST Lower", "p.value"], table["TOST Upper", "p.value"]) < 0.05
    )
  },
  silent = TRUE
)
if (!inherits(check, "try-error")) tost <- rbind(tost, check)
write.csv(tost, file.path(out_dir, "tost.csv"), row.names = FALSE)

# Rankings: Friedman, pairwise Wilcoxon (Holm), mean rank and, if it fits, Plackett-Luce.
ranks$condition <- factor(ranks$condition, levels = conditions)
matrix_ranks <- with(ranks, tapply(rank, list(participant, condition), mean))
matrix_ranks <- matrix_ranks[complete.cases(matrix_ranks), , drop = FALSE]
friedman <- friedman.test(matrix_ranks)
write.csv(
  data.frame(test = "Friedman", statistic = unname(friedman$statistic), df = unname(friedman$parameter), p = friedman$p.value, n = nrow(matrix_ranks)),
  file.path(out_dir, "friedman.csv"), row.names = FALSE
)
pairs_of <- combn(conditions, 2, simplify = FALSE)
pairwise <- do.call(rbind, lapply(pairs_of, function(pair) {
  x <- matrix_ranks[, pair[[1]]]
  y <- matrix_ranks[, pair[[2]]]
  test <- suppressWarnings(wilcox.test(x, y, paired = TRUE, exact = FALSE))
  data.frame(a = pair[[1]], b = pair[[2]], mean_rank_a = mean(x), mean_rank_b = mean(y), V = unname(test$statistic), p = test$p.value)
}))
pairwise$p_holm <- p.adjust(pairwise$p, "holm")
write.csv(pairwise, file.path(out_dir, "pairwise_ranks.csv"), row.names = FALSE)

pl <- try(
  {
    model <- PlackettLuce::PlackettLuce(PlackettLuce::as.rankings(matrix_ranks), npseudo = 0.5)
    worth <- PlackettLuce::itempar(model, log = FALSE)
    data.frame(condition = names(coef(model)), log_worth = coef(model), worth = as.numeric(worth))
  },
  silent = TRUE
)
if (inherits(pl, "try-error")) pl <- data.frame(condition = character(), log_worth = numeric(), worth = numeric())
write.csv(pl, file.path(out_dir, "plackett_luce.csv"), row.names = FALSE)
